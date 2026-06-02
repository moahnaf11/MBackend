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

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: StripeClient;
  private readonly provider = "stripe";

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService,
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
    // charge.payment_intent is the PaymentIntent id.
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

    // Find the most recent refund on Stripe's charge that isn't yet in our DB.
    for (const stripeRefund of charge.refunds?.data ?? []) {
      const existingRefund = await this.prisma.refund.findFirst({
        where: { providerRefundId: stripeRefund.id },
        select: { id: true },
      });

      if (existingRefund) {
        continue; // already recorded
      }

      await this.prisma.refund.create({
        data: {
          orderId: attempt.orderId,
          paymentAttemptId: attempt.id,
          status: RefundStatus.SUCCEEDED,
          amount: new Prisma.Decimal(stripeRefund.amount).div(100), // cents → dollars
          currency: stripeRefund.currency.toUpperCase(),
          providerRefundId: stripeRefund.id,
          reason: stripeRefund.reason ?? null,
          processedAt: new Date(stripeRefund.created * 1000),
        },
      });

      this.logger.log(`Refund ${stripeRefund.id} recorded for order ${attempt.orderId}.`);
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
      select: { id: true, currency: true, status: true },
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
      select: { id: true, providerPaymentId: true, amount: true },
    });

    if (!attempt) {
      throw new NotFoundException("Captured payment attempt not found on this order.");
    }

    if (!attempt.providerPaymentId) {
      throw new BadRequestException("Payment attempt has no provider payment id.");
    }

    // Validate requested amount doesn't exceed captured amount.
    const refundAmount = new Prisma.Decimal(dto.amount);
    if (refundAmount.greaterThan(attempt.amount)) {
      throw new BadRequestException(
        `Refund amount (${dto.amount}) exceeds captured amount (${attempt.amount}).`,
      );
    }

    // Fetch existing refunds to check we're not over-refunding.
    const existingRefundsTotal = await this.prisma.refund.aggregate({
      where: {
        paymentAttemptId: attempt.id,
        status: { in: [RefundStatus.PROCESSING, RefundStatus.SUCCEEDED] },
      },
      _sum: { amount: true },
    });

    const alreadyRefunded = new Prisma.Decimal(existingRefundsTotal._sum.amount ?? 0);
    const maxRefundable = new Prisma.Decimal(attempt.amount).minus(alreadyRefunded);

    if (refundAmount.greaterThan(maxRefundable)) {
      throw new BadRequestException(
        `Refund amount exceeds refundable balance. Already refunded: ${alreadyRefunded}. Remaining: ${maxRefundable}.`,
      );
    }

    // ── Issue refund via Stripe ────────────────────────────────────────────
    const amountInCents = refundAmount.mul(100).toDecimalPlaces(0).toNumber();

    const stripeRefund = await this.stripe.refunds.create({
      payment_intent: attempt.providerPaymentId,
      amount: amountInCents,
      ...(dto.reason && { reason: "requested_by_customer" }),
    });

    // ── Persist Refund row ─────────────────────────────────────────────────
    const refund = await this.prisma.refund.create({
      data: {
        orderId,
        paymentAttemptId: attempt.id,
        status: RefundStatus.PROCESSING,
        amount: refundAmount,
        currency: order.currency,
        providerRefundId: stripeRefund.id,
        reason: dto.reason ?? null,
      },
    });

    // The Refund transitions to SUCCEEDED when Stripe fires charge.refunded.
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

    // prevent duplicate refund
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

    const refundAmount = returnRequest.items.reduce((sum, item) => {
      return sum.plus(new Prisma.Decimal(item.orderItem.unitPrice).mul(item.quantity));
    }, new Prisma.Decimal(0));

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
        `Refund exceeds remaining balance. Remaining: ${maxRefundable}`,
      );
    }

    const stripeRefund = await this.stripe.refunds.create({
      payment_intent: attempt.providerPaymentId,
      amount: refundAmount.mul(100).toDecimalPlaces(0).toNumber(),
    });

    const refund = await this.prisma.refund.create({
      data: {
        orderId: returnRequest.orderId,
        returnRequestId,
        paymentAttemptId: attempt.id,
        status: RefundStatus.PROCESSING,
        amount: refundAmount,
        currency: returnRequest.order.currency,
        providerRefundId: stripeRefund.id,
        reason: "return_request",
      },
    });

    return refund;
  }
}
