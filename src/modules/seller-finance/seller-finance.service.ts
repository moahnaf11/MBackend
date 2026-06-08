import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { CreateBankAccountDto } from "./dto/create-bank-account.dto";
import { PrismaService } from "../../database/prisma.service";
import {
  BankAccountStatus,
  PayoutStatus,
  SellerLedgerEntryType,
  SellerStatus,
} from "../../../generated/prisma/enums";
import { Prisma } from "../../../generated/prisma/client";
import { ListLedgerDto } from "./dto/list-ledger.dto";
import { ListPayoutsDto } from "./dto/list-payouts.dto";
import { RequestPayoutDto } from "./dto/request-payout.dto";
import { UpdatePayoutStatusDto } from "./dto/update-payout-status.dto";

@Injectable()
export class SellerFinanceService {
  private readonly PAYOUT_STATUS_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
    [PayoutStatus.PENDING]: [PayoutStatus.PROCESSING, PayoutStatus.CANCELLED],
    [PayoutStatus.PROCESSING]: [PayoutStatus.PAID, PayoutStatus.FAILED],
    [PayoutStatus.PAID]: [],
    [PayoutStatus.FAILED]: [],
    [PayoutStatus.CANCELLED]: [],
  };
  constructor(private readonly prisma: PrismaService) {}

  // ─── private helpers ──────────────────────────────────────────────────────

  // Resolve the seller profile for the authenticated user.
  // Throws if they don't have an active seller profile.
  private async resolveActiveSeller(userId: string) {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });

    if (!seller) {
      throw new ForbiddenException("No seller profile found for this account.");
    }

    if (seller.status !== SellerStatus.ACTIVE) {
      throw new ForbiddenException(
        "Your seller account must be active to access finance features.",
      );
    }

    return seller;
  }

  // Find a bank account and verify it belongs to this seller.
  private async findOwnedBankAccount(sellerId: string, bankAccountId: string) {
    const account = await this.prisma.sellerBankAccount.findUnique({
      where: { id: bankAccountId },
    });

    if (!account || account.sellerId !== sellerId) {
      throw new NotFoundException("Bank account not found.");
    }

    return account;
  }

  // ─── BALANCE ──────────────────────────────────────────────────────────────

  /**
   * Returns the seller's current balance split into:
   *   - available: funds where availableAt <= now (can be paid out)
   *   - pending:   funds where availableAt > now  (e.g. held for return window)
   *   - total:     available + pending
   *
   * Positive entries = earnings. Negative entries = commission, refunds, payouts.
   * The SUM of all entries is the total balance position.
   */
  async getBalance(userId: string) {
    const seller = await this.resolveActiveSeller(userId);
    const now = new Date();

    const [available, pending] = await this.prisma.$transaction([
      // Available: availableAt is null (immediately available) OR in the past
      this.prisma.sellerLedgerEntry.aggregate({
        where: {
          sellerId: seller.id,
          OR: [{ availableAt: null }, { availableAt: { lte: now } }],
        },
        _sum: { amount: true },
      }),
      // Pending: availableAt is in the future (e.g. held until return window closes)
      this.prisma.sellerLedgerEntry.aggregate({
        where: {
          sellerId: seller.id,
          availableAt: { gt: now },
        },
        _sum: { amount: true },
      }),
    ]);

    const availableAmount = available._sum.amount ?? new Prisma.Decimal(0);
    const pendingAmount = pending._sum.amount ?? new Prisma.Decimal(0);

    return {
      available: availableAmount,
      pending: pendingAmount,
      total: availableAmount.plus(pendingAmount),
      currency: "USD", // TODO: support multi-currency when needed
    };
  }

  // ─── LEDGER ───────────────────────────────────────────────────────────────

  async getLedger(userId: string, query: ListLedgerDto) {
    const seller = await this.resolveActiveSeller(userId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 30);

    const where: Prisma.SellerLedgerEntryWhereInput = {
      sellerId: seller.id,
      ...(query.type && { type: query.type }),
    };

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.sellerLedgerEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          orderItem: {
            select: {
              id: true,
              skuSnapshot: true,
              titleSnapshot: true,
              quantity: true,
              unitPrice: true,
            },
          },
        },
      }),
      this.prisma.sellerLedgerEntry.count({ where }),
    ]);

    return {
      entries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── BANK ACCOUNTS ────────────────────────────────────────────────────────

  async listBankAccounts(userId: string) {
    const seller = await this.resolveActiveSeller(userId);

    return this.prisma.sellerBankAccount.findMany({
      where: { sellerId: seller.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async createBankAccount(userId: string, dto: CreateBankAccountDto) {
    const seller = await this.resolveActiveSeller(userId);

    // Count existing accounts — sellers can have multiple but there should be
    // a reasonable cap (e.g. 10) to prevent abuse
    const existingCount = await this.prisma.sellerBankAccount.count({
      where: { sellerId: seller.id },
    });
    if (existingCount >= 10) {
      throw new BadRequestException("Maximum of 10 bank accounts allowed per seller.");
    }

    const shouldBeDefault = dto.isDefault === true || existingCount === 0;

    // If this will be the new default, clear the flag on all others first
    if (shouldBeDefault) {
      await this.prisma.sellerBankAccount.updateMany({
        where: { sellerId: seller.id },
        data: { isDefault: false },
      });
    }

    return this.prisma.sellerBankAccount.create({
      data: {
        sellerId: seller.id,
        holderName: dto.holderName,
        country: dto.country.toUpperCase(),
        currency: dto.currency.toUpperCase(),
        last4: dto.last4,
        bankName: dto.bankName,
        provider: dto.provider,
        providerBankAccountId: dto.providerBankAccountId,
        isDefault: shouldBeDefault,
        status: BankAccountStatus.PENDING_VERIFICATION,
      },
    });
  }

  async setDefaultBankAccount(userId: string, bankAccountId: string) {
    const seller = await this.resolveActiveSeller(userId);
    await this.findOwnedBankAccount(seller.id, bankAccountId);

    // Atomic: clear all defaults then set the new one
    await this.prisma.$transaction([
      this.prisma.sellerBankAccount.updateMany({
        where: { sellerId: seller.id },
        data: { isDefault: false },
      }),
      this.prisma.sellerBankAccount.update({
        where: { id: bankAccountId },
        data: { isDefault: true },
      }),
    ]);

    return this.prisma.sellerBankAccount.findUnique({ where: { id: bankAccountId } });
  }

  async deleteBankAccount(userId: string, bankAccountId: string) {
    const seller = await this.resolveActiveSeller(userId);
    const account = await this.findOwnedBankAccount(seller.id, bankAccountId);

    // Block deletion if a pending payout targets this account
    const pendingPayout = await this.prisma.sellerPayout.findFirst({
      where: {
        sellerId: seller.id,
        bankAccountId,
        status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] },
      },
      select: { id: true },
    });

    if (pendingPayout) {
      throw new ConflictException(
        "Cannot delete this bank account — a pending payout is targeting it. Wait for the payout to complete or cancel it first.",
      );
    }

    await this.prisma.sellerBankAccount.delete({ where: { id: bankAccountId } });

    // If we deleted the default, auto-promote the most recently added account
    if (account.isDefault) {
      const next = await this.prisma.sellerBankAccount.findFirst({
        where: { sellerId: seller.id },
        orderBy: { createdAt: "desc" },
      });
      if (next) {
        await this.prisma.sellerBankAccount.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  }

  // ─── PAYOUTS ──────────────────────────────────────────────────────────────

  async listPayouts(userId: string, query: ListPayoutsDto) {
    const seller = await this.resolveActiveSeller(userId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);

    const where: Prisma.SellerPayoutWhereInput = {
      sellerId: seller.id,
      ...(query.status && { status: query.status }),
    };

    const [payouts, total] = await this.prisma.$transaction([
      this.prisma.sellerPayout.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { bankAccount: true },
      }),
      this.prisma.sellerPayout.count({ where }),
    ]);

    return {
      payouts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Seller requests a withdrawal of `amount` from their available balance.
   *
   * Flow:
   *   1. Resolve seller and validate they have an active verified bank account
   *   2. Check available balance >= requested amount
   *   3. Inside a transaction:
   *      a. Create the SellerPayout record (status=PENDING)
   *      b. Write a negative PAYOUT ledger entry — this immediately reduces
   *         the available balance so the seller can't double-withdraw
   *      c. Create SellerPayoutItem rows linking ledger entries to this payout
   */
  async requestPayout(userId: string, dto: RequestPayoutDto) {
    const seller = await this.resolveActiveSeller(userId);
    const amount = new Prisma.Decimal(dto.amount);

    if (amount.lte(0)) {
      throw new BadRequestException("Payout amount must be greater than zero.");
    }

    // Resolve bank account
    let bankAccountId = dto.bankAccountId;
    if (!bankAccountId) {
      const defaultAccount = await this.prisma.sellerBankAccount.findFirst({
        where: { sellerId: seller.id, isDefault: true },
        select: { id: true, status: true },
      });
      if (!defaultAccount) {
        throw new BadRequestException(
          "No default bank account found. Add a bank account before requesting a payout.",
        );
      }
      if (defaultAccount.status !== BankAccountStatus.VERIFIED) {
        throw new BadRequestException(
          "Your bank account is not yet verified. Please wait for verification before requesting a payout.",
        );
      }
      bankAccountId = defaultAccount.id;
    } else {
      const account = await this.findOwnedBankAccount(seller.id, bankAccountId);
      if (account.status !== BankAccountStatus.VERIFIED) {
        throw new BadRequestException("This bank account is not yet verified.");
      }
    }

    // Check available balance
    const balance = await this.getBalance(userId);
    if (balance.available.lt(amount)) {
      throw new BadRequestException(
        `Insufficient available balance. Available: ${balance.available.toFixed(2)}, requested: ${amount.toFixed(2)}.`,
      );
    }

    // Block if there's already a pending payout (one at a time)
    const pendingPayout = await this.prisma.sellerPayout.findFirst({
      where: {
        sellerId: seller.id,
        status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] },
      },
      select: { id: true },
    });
    if (pendingPayout) {
      throw new ConflictException(
        "You already have a pending payout in progress. Wait for it to complete before requesting another.",
      );
    }

    // Execute atomically
    const payout = await this.prisma.$transaction(async (tx) => {
      // Create the payout record
      const payout = await tx.sellerPayout.create({
        data: {
          sellerId: seller.id,
          bankAccountId,
          status: PayoutStatus.PENDING,
          amount,
          currency: "USD",
        },
        select: { id: true },
      });

      // Write the negative PAYOUT ledger entry — reduces available balance immediately
      const ledgerEntry = await tx.sellerLedgerEntry.create({
        data: {
          sellerId: seller.id,
          type: SellerLedgerEntryType.PAYOUT,
          amount: amount.negated(), // negative = money leaving the ledger
          currency: "USD",
          description: `Payout request ${payout.id}`,
          availableAt: null, // immediately reflected in available balance
        },
        select: { id: true },
      });

      // Link the ledger entry to the payout
      await tx.sellerPayoutItem.create({
        data: {
          payoutId: payout.id,
          ledgerEntryId: ledgerEntry.id,
          amount,
        },
      });

      return payout.id;
    });

    return this.prisma.sellerPayout.findUnique({
      where: { id: payout },
      include: { bankAccount: true },
    });
  }

  // ─── ADMIN: update payout status ─────────────────────────────────────────

  /**
   * Admin marks a payout as PROCESSING, PAID, FAILED, or CANCELLED.
   *
   * When CANCELLED:
   *   - Write a positive ADJUSTMENT ledger entry to reverse the PAYOUT entry
   *     (money goes back into the seller's available balance)
   *
   * When FAILED:
   *   - Same reversal — the payout didn't go through so money returns
   */
  async adminUpdatePayoutStatus(payoutId: string, dto: UpdatePayoutStatusDto) {
    const payout = await this.prisma.sellerPayout.findUnique({
      where: { id: payoutId },
      include: { items: { include: { ledgerEntry: true } } },
    });

    if (!payout) throw new NotFoundException("Payout not found.");

    // Can't move from a terminal state
    const allowedTransitions = this.PAYOUT_STATUS_TRANSITIONS[payout.status];

    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Payout cannot transition from ${payout.status} to ${dto.status}.`,
      );
    }

    // When cancelling or marking failed, reverse the ledger entry
    const shouldReverse =
      dto.status === PayoutStatus.CANCELLED || dto.status === PayoutStatus.FAILED;

    await this.prisma.$transaction(async (tx) => {
      await tx.sellerPayout.update({
        where: { id: payoutId },
        data: {
          status: dto.status,
          ...(dto.providerPayoutId && { providerPayoutId: dto.providerPayoutId }),
          ...(dto.failureReason && { failureReason: dto.failureReason }),
          ...(dto.status === PayoutStatus.PAID && { paidAt: new Date() }),
        },
      });

      if (shouldReverse) {
        // Write a positive ADJUSTMENT to return the money to the ledger
        await tx.sellerLedgerEntry.create({
          data: {
            sellerId: payout.sellerId,
            type: SellerLedgerEntryType.ADJUSTMENT,
            amount: payout.amount, // positive = money returning
            currency: payout.currency,
            description: `Reversal for ${dto.status === PayoutStatus.CANCELLED ? "cancelled" : "failed"} payout ${payoutId}`,
            availableAt: null,
          },
        });
      }
    });

    return this.prisma.sellerPayout.findUnique({
      where: { id: payoutId },
      include: { bankAccount: true, seller: { select: { storeName: true, slug: true } } },
    });
  }

  // ─── ADMIN: list all payouts ──────────────────────────────────────────────

  async adminListPayouts(query: ListPayoutsDto & { sellerId?: string }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);

    const where: Prisma.SellerPayoutWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.sellerId && { sellerId: query.sellerId }),
    };

    const [payouts, total] = await this.prisma.$transaction([
      this.prisma.sellerPayout.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          bankAccount: true,
          seller: { select: { id: true, storeName: true, slug: true } },
        },
      }),
      this.prisma.sellerPayout.count({ where }),
    ]);

    return {
      payouts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Creates refund ledger entries for a specific order item and quantity.
   * Called by both the admin direct refund flow and the customer return flow.
   *
   * Proportional calculation:
   *   refundedQuantity / originalQuantity = the fraction of this item being refunded
   *   sellerRefundAmount = sellerPayoutAmount * fraction
   *   commissionRefundAmount = commissionAmount * fraction
   */
  async createRefundLedgerEntryForItem(
    tx: Prisma.TransactionClient,
    orderItemId: string,
    refundedQuantity: number,
  ): Promise<void> {
    const orderItem = await tx.orderItem.findUnique({
      where: { id: orderItemId },
      select: {
        id: true,
        sellerId: true,
        sellerPayoutAmount: true,
        commissionAmount: true,
        quantity: true,
        order: { select: { currency: true } },
      },
    });

    if (!orderItem) {
      throw new NotFoundException(`Order item ${orderItemId} not found.`);
    }

    const currency = orderItem.order.currency ?? "USD";

    // Calculate the fraction being refunded
    const refundRatio = new Prisma.Decimal(refundedQuantity).div(orderItem.quantity);

    const sellerRefundAmount = new Prisma.Decimal(orderItem.sellerPayoutAmount)
      .mul(refundRatio)
      .toDecimalPlaces(2);

    const commissionRefundAmount = new Prisma.Decimal(orderItem.commissionAmount)
      .mul(refundRatio)
      .toDecimalPlaces(2);

    // Check how much has already been reversed for this item
    // This supports multiple partial refunds on the same item
    const existingRefundTotal = await tx.sellerLedgerEntry.aggregate({
      where: {
        orderItemId,
        type: SellerLedgerEntryType.REFUND,
      },
      _sum: { amount: true },
    });

    // Existing refund entries are negative — negate to get the positive already-refunded amount
    const alreadyReversed = new Prisma.Decimal(existingRefundTotal._sum.amount ?? 0).negated();

    // Cap so we never reverse more than the full sellerPayoutAmount
    const maxReversible = new Prisma.Decimal(orderItem.sellerPayoutAmount);
    if (alreadyReversed.gte(maxReversible)) {
      // Already fully reversed — skip silently (idempotent)
      return;
    }

    const cappedSellerRefund = Prisma.Decimal.min(
      sellerRefundAmount,
      maxReversible.minus(alreadyReversed),
    );

    await tx.sellerLedgerEntry.create({
      data: {
        sellerId: orderItem.sellerId,
        orderItemId,
        type: SellerLedgerEntryType.REFUND,
        amount: cappedSellerRefund.negated(),
        currency,
        description: `Refund reversal — ${refundedQuantity} of ${orderItem.quantity} units`,
        availableAt: null,
      },
    });

    if (commissionRefundAmount.gt(0)) {
      await tx.sellerLedgerEntry.create({
        data: {
          sellerId: orderItem.sellerId,
          orderItemId,
          type: SellerLedgerEntryType.ADJUSTMENT,
          amount: commissionRefundAmount,
          currency,
          description: `Commission reversal — ${refundedQuantity} of ${orderItem.quantity} units`,
          availableAt: null,
        },
      });
    }
  }

  /**
   * Convenience method — reverses ledger entries for ALL items on an order.
   * Called when an entire order is refunded via order status → REFUNDED.
   */
  async createRefundLedgerEntriesForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const orderItems = await tx.orderItem.findMany({
      where: { orderId },
      select: { id: true, quantity: true },
    });

    for (const item of orderItems) {
      await this.createRefundLedgerEntryForItem(tx, item.id, item.quantity);
    }
  }
}
