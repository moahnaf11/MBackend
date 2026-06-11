import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";

import { OrdersService } from "../orders/orders.service";

import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { CreatePaymentIntentDto } from "./dto/create-payment-intent.dto";
import {
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  ReturnRequestStatus,
} from "../../../generated/prisma/enums";
import { Prisma } from "../../../generated/prisma/client";
import { CreateRefundDto } from "./dto/create-refund.dto";
import { StripeCharge, StripeClient, StripeEvent, StripePaymentIntent } from "./stripe.types";
import { SellerFinanceService } from "../seller-finance/seller-finance.service";
import { InventoryService } from "../inventory/inventory.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import { NotificationEvents } from "../notifications/constants/notification-events";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: StripeClient;
  private readonly provider = "stripe";

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService,
    private readonly sellerFinanceService: SellerFinanceService,
    private readonly inventoryService: InventoryService,
    private readonly outboxService: OutboxService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow<string>("STRIPE_SECRET_KEY"));
  }

  // ─── PAYMENT INTENT ───────────────────────────────────────────────────────

  /**
   * Creates a Stripe PaymentIntent and a corresponding PaymentAttempt row.
   *
   * Idempotent — if a REQUIRES_ACTION attempt already exists for this order,
   * the existing Stripe PaymentIntent is returned instead of creating a new one.
   * This handles the case where the customer refreshes the checkout page.
   *
   * Only works on PENDING_PAYMENT orders owned by the calling user.
   */
  async createIntent(userId: string, orderId: string, dto: CreatePaymentIntentDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        currency: true,
        orderNumber: true,
        payments: {
          where: { status: PaymentStatus.REQUIRES_ACTION },
          select: {
            id: true,
            providerPaymentId: true,
            idempotencyKey: true,
            amount: true,
          },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundException("Order not found.");
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new ConflictException(
        `Order is not awaiting payment (current status: ${order.status}).`,
      );
    }

    // ── Idempotency check ──────────────────────────────────────────────────
    // If a pending attempt already exists, return its existing PaymentIntent
    // so the frontend can reuse it rather than creating a duplicate charge.
    const existingAttempt = order.payments[0];
    if (existingAttempt?.providerPaymentId) {
      const existingIntent = await this.stripe.paymentIntents.retrieve(
        existingAttempt.providerPaymentId,
      );

      return {
        paymentAttemptId: existingAttempt.id,
        clientSecret: existingIntent.client_secret,
        amount: existingAttempt.amount,
        currency: order.currency,
      };
    }

    // ── Create Stripe PaymentIntent ────────────────────────────────────────
    // Amount in Stripe is always in the smallest currency unit (cents for USD).
    const amountInCents = new Prisma.Decimal(order.totalAmount)
      .mul(100)
      .toDecimalPlaces(0)
      .toNumber();

    const currency = (dto.currency ?? order.currency).toLowerCase();
    const idempotencyKey = randomUUID();

    const intent = await this.stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
        ...(dto.paymentMethodId && { payment_method: dto.paymentMethodId }),
        // automatic_payment_methods lets Stripe handle the payment method
        // types without us having to enumerate them.
        automatic_payment_methods: { enabled: true },
      },
      // Stripe idempotency key prevents double-charge if the request is retried.
      { idempotencyKey },
    );

    // ── Persist PaymentAttempt ─────────────────────────────────────────────
    const attempt = await this.prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: this.provider,
        providerPaymentId: intent.id,
        idempotencyKey,
        status: PaymentStatus.REQUIRES_ACTION,
        amount: order.totalAmount,
        currency: order.currency,
      },
      select: { id: true, amount: true },
    });

    return {
      paymentAttemptId: attempt.id,
      clientSecret: intent.client_secret,
      amount: attempt.amount,
      currency: order.currency,
    };
  }

  // ─── WEBHOOK ──────────────────────────────────────────────────────────────

  /**
   * Handles verified Stripe webhook events.
   *
   * The StripeWebhookGuard has already verified the signature and attached
   * the parsed event to req.stripeEvent before this method is called.
   *
   * We handle only the events we care about and ignore the rest. This is
   * intentional — Stripe sends many event types and future ones should be
   * opted into explicitly.
   */
  async handleWebhook(event: StripeEvent): Promise<void> {
    switch (event.type) {
      case "payment_intent.succeeded":
        await this.handlePaymentIntentSucceeded(event.data.object as StripePaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await this.handlePaymentIntentFailed(event.data.object as StripePaymentIntent);
        break;

      case "payment_intent.canceled":
        await this.handlePaymentIntentCanceled(event.data.object as StripePaymentIntent);
        break;

      case "charge.refunded":
        await this.handleChargeRefunded(event.data.object as StripeCharge);
        break;

      default:
        // Unhandled event type — log and return 200 so Stripe doesn't retry.
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  // ─── WEBHOOK HANDLERS ─────────────────────────────────────────────────────

  private async handlePaymentIntentSucceeded(intent: StripePaymentIntent): Promise<void> {
    const attempt = await this.findAttemptByProviderPaymentId(intent.id);

    if (!attempt) {
      this.logger.warn(`PaymentAttempt not found for PaymentIntent ${intent.id} — skipping.`);
      return;
    }

    // Guard against duplicate webhook delivery — Stripe guarantees at-least-once.
    if (attempt.status === PaymentStatus.CAPTURED) {
      this.logger.log(`PaymentAttempt ${attempt.id} already captured — skipping duplicate.`);
      return;
    }

    await this.prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaymentStatus.CAPTURED,
        capturedAt: new Date(),
        authorizedAt: new Date(),
      },
    });

    // Transition the order to PAID — this also consumes inventory reservations
    // and creates seller ledger entries via ordersService.updateStatus.
    await this.ordersService.updateStatus(attempt.orderId, {
      status: OrderStatus.PAID,
      note: `Payment captured via Stripe — PaymentIntent ${intent.id}`,
    });

    this.logger.log(`Order ${attempt.orderId} marked PAID via PaymentIntent ${intent.id}.`);
  }

  private async handlePaymentIntentFailed(intent: StripePaymentIntent): Promise<void> {
    const attempt = await this.findAttemptByProviderPaymentId(intent.id);

    if (!attempt) {
      this.logger.warn(`PaymentAttempt not found for PaymentIntent ${intent.id} — skipping.`);
      return;
    }

    if (attempt.status === PaymentStatus.FAILED) {
      return; // already handled
    }

    const failureReason =
      intent.last_payment_error?.message ?? "Payment failed — no details provided.";

    await this.prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaymentStatus.FAILED,
        failureReason,
      },
    });

    // The order stays PENDING_PAYMENT — the customer can retry.
    // We don't release inventory reservations here because the order is still open.
    this.logger.log(`PaymentAttempt ${attempt.id} failed: ${failureReason}`);
  }

  private async handlePaymentIntentCanceled(intent: StripePaymentIntent): Promise<void> {
    const attempt = await this.findAttemptByProviderPaymentId(intent.id);

    if (!attempt) {
      this.logger.warn(`PaymentAttempt not found for PaymentIntent ${intent.id} — skipping.`);
      return;
    }

    if (attempt.status === PaymentStatus.CANCELLED) {
      return; // already handled
    }

    await this.prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: PaymentStatus.CANCELLED },
    });

    this.logger.log(`PaymentAttempt ${attempt.id} cancelled.`);
  }

  private async handleChargeRefunded(charge: StripeCharge): Promise<void> {
    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;

    if (!paymentIntentId) {
      this.logger.warn("charge.refunded event has no payment_intent — skipping.");
      return;
    }

    const attempt = await this.findAttemptByProviderPaymentId(paymentIntentId);

    if (!attempt) {
      this.logger.warn(`PaymentAttempt not found for PaymentIntent ${paymentIntentId} — skipping.`);
      return;
    }

    for (const stripeRefund of charge.refunds?.data ?? []) {
      // Find ALL Refund rows for this Stripe refund ID
      // Admin refunds: one row (full order) or one row (single item)
      // Customer returns: one row per return item, all sharing same providerRefundId
      const refundRows = await this.prisma.refund.findMany({
        where: { providerRefundId: stripeRefund.id },
      });

      if (refundRows.length === 0) {
        this.logger.warn(`Refund ${stripeRefund.id} has no matching Refund rows — skipping.`);
        continue;
      }

      // Process each row in its own transaction so one failure doesn't
      // block the others (partial success is better than total rollback here)
      for (const refund of refundRows) {
        // Idempotency — skip rows already processed
        if (refund.status === RefundStatus.SUCCEEDED) continue;

        await this.prisma.$transaction(async (tx) => {
          // ── 1. Mark this Refund row as SUCCEEDED ──────────────────────────
          await tx.refund.update({
            where: { id: refund.id },
            data: {
              status: RefundStatus.SUCCEEDED,
              processedAt: new Date(stripeRefund.created * 1000),
            },
          });

          // ── 2. Write seller ledger entries ─────────────────────────────────
          // Both admin and customer return refunds now have orderItemId set,
          // so this always takes the item-level path
          if (refund.orderItemId && refund.refundedQuantity) {
            await this.sellerFinanceService.createRefundLedgerEntryForItem(
              tx,
              refund.orderItemId,
              refund.refundedQuantity,
            );
          } else {
            // Fallback for legacy refunds created before this change
            await this.sellerFinanceService.createRefundLedgerEntriesForOrder(tx, refund.orderId);
          }

          // ── 3. Restock inventory ────────────────────────────────────────────
          if (refund.orderItemId && refund.refundedQuantity) {
            await this.inventoryService.restockOrderItem(
              tx,
              refund.orderItemId,
              refund.refundedQuantity,
            );
          } else {
            // Fallback for legacy refunds
            await this.inventoryService.restockOrderItems(tx, refund.orderId);
          }

          // ── 4. Update PaymentAttempt status ─────────────────────────────────
          // Only update after ALL rows for this Stripe refund are processed.
          // Check if this is the last row being processed for this providerRefundId.
          if (refund.paymentAttemptId) {
            const remainingProcessing = await tx.refund.count({
              where: {
                providerRefundId: stripeRefund.id,
                status: { not: RefundStatus.SUCCEEDED },
                id: { not: refund.id }, // exclude the one we just updated
              },
            });

            if (remainingProcessing === 0) {
              // All rows for this Stripe refund are now SUCCEEDED —
              // check if the full payment amount has been refunded
              const totalRefunded = await tx.refund.aggregate({
                where: {
                  paymentAttemptId: refund.paymentAttemptId,
                  status: RefundStatus.SUCCEEDED,
                },
                _sum: { amount: true },
              });

              const refundedTotal = new Prisma.Decimal(totalRefunded._sum.amount ?? 0);
              const paymentAttempt = await tx.paymentAttempt.findUnique({
                where: { id: refund.paymentAttemptId },
                select: { amount: true },
              });

              if (paymentAttempt) {
                const isFullyRefunded = refundedTotal.gte(paymentAttempt.amount);
                await tx.paymentAttempt.update({
                  where: { id: refund.paymentAttemptId },
                  data: {
                    status: isFullyRefunded
                      ? PaymentStatus.REFUNDED
                      : PaymentStatus.PARTIALLY_REFUNDED,
                  },
                });
                // ── NEW: Also update order status when fully refunded ──────────────
                if (isFullyRefunded) {
                  const order = await tx.order.findUnique({
                    where: { id: refund.orderId },
                    select: { status: true },
                  });

                  // Only update if not already REFUNDED (idempotency)
                  if (order && order.status !== OrderStatus.REFUNDED) {
                    await tx.order.update({
                      where: { id: refund.orderId },
                      data: { status: OrderStatus.REFUNDED },
                    });

                    await tx.orderStatusEvent.create({
                      data: {
                        orderId: refund.orderId,
                        toStatus: OrderStatus.REFUNDED,
                        fromStatus: order.status,
                        note: `All payments refunded. Stripe refund: ${stripeRefund.id}`,
                      },
                    });
                  }
                }
              }
            }
          }
        });
        // Emit notification after transaction commits — outside so a notification
        // failure never rolls back the refund processing
        const order = await this.prisma.order.findUnique({
          where: { id: refund.orderId },
          select: { userId: true, orderNumber: true, currency: true },
        });

        if (order?.userId) {
          await this.outboxService.emit(
            NotificationEvents.REFUND_SUCCEEDED,
            {
              userId: order.userId,
              orderId: refund.orderId,
              orderNumber: order.orderNumber,
              amount: new Prisma.Decimal(stripeRefund.amount).div(100).toString(),
              currency: order.currency,
            },
            refund.orderId,
            "Order",
          );
        }

        this.logger.log(
          `Refund row ${refund.id} (Stripe: ${stripeRefund.id}) succeeded` +
            (refund.orderItemId ? ` — item ${refund.orderItemId}` : " — full order"),
        );
      }
    }
  }

  // ─── REFUNDS ──────────────────────────────────────────────────────────────

  /**
   * Initiates a refund via Stripe and creates a Refund row in PROCESSING status.
   * The refund is confirmed when Stripe fires the charge.refunded webhook,
   * which updates the row to SUCCEEDED.
   *
   * Admin only — customers initiate refunds via the returns flow.
   */
  async createRefund(orderId: string, dto: CreateRefundDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        currency: true,
        status: true,
      },
    });

    if (!order) {
      throw new NotFoundException("Order not found.");
    }

    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: {
        id: dto.paymentAttemptId,
        orderId,
        status: PaymentStatus.CAPTURED,
      },
      select: {
        id: true,
        providerPaymentId: true,
        amount: true,
      },
    });

    if (!attempt) {
      throw new NotFoundException("Captured payment attempt not found on this order.");
    }

    if (!attempt.providerPaymentId) {
      throw new BadRequestException("Payment attempt has no provider payment id.");
    }

    // ─────────────────────────────────────────────
    // ITEM VALIDATION
    // ─────────────────────────────────────────────

    let refundedQuantity: number | null = null;

    if (dto.orderItemId) {
      const orderItem = await this.prisma.orderItem.findFirst({
        where: { id: dto.orderItemId, orderId },
        select: { quantity: true }, // ← only quantity needed
      });

      if (!orderItem) {
        throw new NotFoundException("Order item not found on this order.");
      }

      refundedQuantity = dto.quantity ?? orderItem.quantity;

      if (refundedQuantity > orderItem.quantity) {
        throw new BadRequestException(
          `Cannot refund ${refundedQuantity} units — order item only has ${orderItem.quantity}.`,
        );
      }
    }

    // ─────────────────────────────────────────────
    // OVER-REFUND GUARD
    // ─────────────────────────────────────────────

    const existingRefundsTotal = await this.prisma.refund.aggregate({
      where: {
        paymentAttemptId: attempt.id,
        status: {
          in: [RefundStatus.PROCESSING, RefundStatus.SUCCEEDED],
        },
      },
      _sum: {
        amount: true,
      },
    });

    const alreadyRefunded = new Prisma.Decimal(existingRefundsTotal._sum.amount ?? 0);

    const maxRefundable = new Prisma.Decimal(attempt.amount).minus(alreadyRefunded);

    const refundAmount = new Prisma.Decimal(dto.amount);

    if (refundAmount.greaterThan(maxRefundable)) {
      throw new BadRequestException(
        `Refund exceeds remaining balance. Already refunded: ${alreadyRefunded}. Remaining: ${maxRefundable}.`,
      );
    }

    // ─────────────────────────────────────────────
    // STRIPE REFUND
    // ─────────────────────────────────────────────

    const amountInCents = refundAmount.mul(100).toDecimalPlaces(0).toNumber();

    const stripeRefund = await this.stripe.refunds.create({
      payment_intent: attempt.providerPaymentId,
      amount: amountInCents,
    });

    // ─────────────────────────────────────────────
    // STORE REFUND CONTEXT
    // THIS IS WHAT THE WEBHOOK WILL USE
    // ─────────────────────────────────────────────

    const refund = await this.prisma.refund.create({
      data: {
        orderId,
        paymentAttemptId: attempt.id,

        orderItemId: dto.orderItemId ?? null,
        refundedQuantity,

        status: RefundStatus.PROCESSING,

        amount: refundAmount,
        currency: order.currency,

        providerRefundId: stripeRefund.id,
        reason: dto.reason ?? null,
      },
    });

    return refund;
  }

  // ─── QUERIES ──────────────────────────────────────────────────────────────

  async findAttemptsForOrder(userId: string, orderId: string) {
    // Verify the order belongs to this user.
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundException("Order not found.");
    }

    return this.prisma.paymentAttempt.findMany({
      where: { orderId },
      include: { refunds: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findAttemptById(id: string) {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { id },
      include: { refunds: true, order: { select: { id: true, orderNumber: true, status: true } } },
    });

    if (!attempt) {
      throw new NotFoundException("Payment attempt not found.");
    }

    return attempt;
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  private async findAttemptByProviderPaymentId(providerPaymentId: string) {
    return this.prisma.paymentAttempt.findFirst({
      where: { providerPaymentId, provider: this.provider },
      select: { id: true, orderId: true, status: true, amount: true },
    });
  }

  async processReturnRefund(returnRequestId: string) {
    const returnRequest = await this.prisma.returnRequest.findUnique({
      where: { id: returnRequestId },
      include: {
        items: {
          include: { orderItem: true },
        },
        order: true,
      },
    });

    if (!returnRequest) {
      throw new NotFoundException("Return request not found.");
    }

    if (
      returnRequest.status !== ReturnRequestStatus.APPROVED &&
      returnRequest.status !== ReturnRequestStatus.RECEIVED
    ) {
      throw new BadRequestException("Return not eligible for refund yet.");
    }

    // Idempotency — if a refund already exists for this return, return it
    const existingRefund = await this.prisma.refund.findFirst({
      where: {
        returnRequestId,
        status: { in: [RefundStatus.PROCESSING, RefundStatus.SUCCEEDED] },
      },
    });
    if (existingRefund) return existingRefund;

    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: {
        orderId: returnRequest.orderId,
        status: PaymentStatus.CAPTURED,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!attempt?.providerPaymentId) {
      throw new BadRequestException("No captured payment found for refund.");
    }

    // Calculate total refund amount from the returned items
    const refundAmount = returnRequest.items.reduce((sum, item) => {
      return sum.plus(new Prisma.Decimal(item.orderItem.unitPrice).mul(item.quantity));
    }, new Prisma.Decimal(0));

    // Over-refund guard
    const existingRefunds = await this.prisma.refund.aggregate({
      where: {
        paymentAttemptId: attempt.id,
        status: { in: [RefundStatus.PROCESSING, RefundStatus.SUCCEEDED] },
      },
      _sum: { amount: true },
    });

    const alreadyRefunded = new Prisma.Decimal(existingRefunds._sum.amount ?? 0);
    const maxRefundable = new Prisma.Decimal(attempt.amount).minus(alreadyRefunded);

    if (refundAmount.greaterThan(maxRefundable)) {
      throw new BadRequestException(
        `Refund exceeds remaining balance. Remaining: ${maxRefundable.toFixed(2)}`,
      );
    }

    // Create the Stripe refund for the total amount
    const stripeRefund = await this.stripe.refunds.create({
      payment_intent: attempt.providerPaymentId,
      amount: refundAmount.mul(100).toDecimalPlaces(0).toNumber(),
    });

    // ─── KEY CHANGE ──────────────────────────────────────────────────────────
    // Create ONE Refund row per return item, each with orderItemId and
    // refundedQuantity. This tells the webhook exactly which item to restock
    // and which ledger entry to write — same as the admin item-level flow.
    //
    // All rows share the same providerRefundId so the webhook can find them
    // all when the charge.refunded event fires.
    // ─────────────────────────────────────────────────────────────────────────
    const refunds = await this.prisma.$transaction(
      returnRequest.items.map((item) =>
        this.prisma.refund.create({
          data: {
            orderId: returnRequest.orderId,
            returnRequestId,
            paymentAttemptId: attempt.id,
            orderItemId: item.orderItemId, // ← per-item
            refundedQuantity: item.quantity, // ← per-item
            status: RefundStatus.PROCESSING,
            amount: new Prisma.Decimal(item.orderItem.unitPrice).mul(item.quantity),
            currency: returnRequest.order.currency,
            providerRefundId: stripeRefund.id, // same Stripe refund ID for all
            reason: "return_request",
          },
        }),
      ),
    );

    // Return the first row — callers only check existence, not the full list
    return refunds[0];
  }
}
