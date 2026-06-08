import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";

import { CreateBankAccountDto } from "./dto/create-bank-account.dto";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../users/guards/roles.guard";
import { Roles } from "../users/guards/roles.decorator";

import type { AuthenticatedRequest } from "../auth/types/auth.types";
import { PayoutStatus, UserRole } from "../../../generated/prisma/enums";
import { SellerFinanceService } from "./seller-finance.service";
import { ListLedgerDto } from "./dto/list-ledger.dto";
import { ListPayoutsDto } from "./dto/list-payouts.dto";
import { RequestPayoutDto } from "./dto/request-payout.dto";
import { UpdatePayoutStatusDto } from "./dto/update-payout-status.dto";

// ─── SELLER ROUTES (/seller/me/...) ───────────────────────────────────────────

@ApiTags("seller-finance")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SELLER, UserRole.ADMIN)
@Controller("seller/me")
export class SellerFinanceController {
  constructor(private readonly sellerFinanceService: SellerFinanceService) {}

  // GET /seller/me/balance
  // Returns available and pending balance totals
  @Get("balance")
  @ApiOperation({
    summary: "Get seller balance",
    description:
      "Returns available balance (can be paid out now) and pending balance (held for return windows). Both are in the same currency.",
  })
  @ApiOkResponse({ description: "Balance summary" })
  getBalance(@Request() req: AuthenticatedRequest) {
    return this.sellerFinanceService.getBalance(req.user.id);
  }

  // GET /seller/me/ledger
  // Paginated ledger entries — the seller's full transaction history
  @Get("ledger")
  @ApiOperation({
    summary: "Get ledger entries",
    description:
      "Paginated list of all ledger entries — sales, commissions, refunds, payouts, and adjustments. Positive = earning, negative = deduction.",
  })
  @ApiOkResponse({ description: "Paginated ledger with meta" })
  getLedger(@Request() req: AuthenticatedRequest, @Query() query: ListLedgerDto) {
    return this.sellerFinanceService.getLedger(req.user.id, query);
  }

  // ─── BANK ACCOUNTS ────────────────────────────────────────────────────────

  // GET /seller/me/bank-accounts
  @Get("bank-accounts")
  @ApiOperation({ summary: "List bank accounts" })
  @ApiOkResponse({ description: "List of saved bank accounts, default first" })
  listBankAccounts(@Request() req: AuthenticatedRequest) {
    return this.sellerFinanceService.listBankAccounts(req.user.id);
  }

  // POST /seller/me/bank-accounts
  @Post("bank-accounts")
  @ApiOperation({
    summary: "Add a bank account",
    description:
      "New accounts start as PENDING_VERIFICATION. An admin or payment provider must verify before payouts can be sent.",
  })
  @ApiOkResponse({ description: "Created bank account" })
  createBankAccount(@Request() req: AuthenticatedRequest, @Body() dto: CreateBankAccountDto) {
    return this.sellerFinanceService.createBankAccount(req.user.id, dto);
  }

  // PATCH /seller/me/bank-accounts/:id/default
  // MUST be declared before /:id to avoid "default" matching as an ID
  @Patch("bank-accounts/:id/default")
  @ApiOperation({ summary: "Set bank account as default payout destination" })
  @ApiParam({ name: "id", description: "Bank account cuid" })
  @ApiOkResponse({ description: "Updated bank account" })
  setDefaultBankAccount(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.sellerFinanceService.setDefaultBankAccount(req.user.id, id);
  }

  // DELETE /seller/me/bank-accounts/:id
  @Delete("bank-accounts/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove a bank account",
    description: "Blocked if a pending payout targets this account.",
  })
  @ApiParam({ name: "id", description: "Bank account cuid" })
  @ApiNoContentResponse({ description: "Bank account deleted" })
  async deleteBankAccount(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<void> {
    await this.sellerFinanceService.deleteBankAccount(req.user.id, id);
  }

  // ─── PAYOUTS ──────────────────────────────────────────────────────────────

  // GET /seller/me/payouts
  @Get("payouts")
  @ApiOperation({ summary: "List payout history" })
  @ApiOkResponse({ description: "Paginated payout list" })
  listPayouts(@Request() req: AuthenticatedRequest, @Query() query: ListPayoutsDto) {
    return this.sellerFinanceService.listPayouts(req.user.id, query);
  }

  // POST /seller/me/payouts
  @Post("payouts")
  @ApiOperation({
    summary: "Request a payout",
    description:
      "Withdraws the specified amount from your available balance to your default (or specified) verified bank account. One pending payout at a time is allowed.",
  })
  @ApiOkResponse({ description: "Created payout request" })
  requestPayout(@Request() req: AuthenticatedRequest, @Body() dto: RequestPayoutDto) {
    return this.sellerFinanceService.requestPayout(req.user.id, dto);
  }
}

// ─── ADMIN ROUTES (/admin/payouts/...) ────────────────────────────────────────

@ApiTags("admin-payouts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("admin/payouts")
export class AdminPayoutsController {
  constructor(private readonly sellerFinanceService: SellerFinanceService) {}

  // GET /admin/payouts
  @Get()
  @ApiOperation({ summary: "List all seller payouts (admin)" })
  @ApiQuery({ name: "status", enum: PayoutStatus, required: false })
  @ApiQuery({ name: "sellerId", required: false })
  @ApiOkResponse({ description: "Paginated payout list across all sellers" })
  adminListPayouts(@Query() query: ListPayoutsDto & { sellerId?: string }) {
    return this.sellerFinanceService.adminListPayouts(query);
  }

  // PATCH /admin/payouts/:id/status
  // Admin processes a payout: PENDING → PROCESSING → PAID / FAILED / CANCELLED
  @Patch(":id/status")
  @ApiOperation({
    summary: "Update payout status (admin)",
    description:
      "Move a payout through its lifecycle. Cancelling or failing a payout automatically reverses the negative ledger entry so the seller gets their balance back.",
  })
  @ApiParam({ name: "id", description: "Payout cuid" })
  @ApiOkResponse({ description: "Updated payout" })
  adminUpdatePayoutStatus(@Param("id") id: string, @Body() dto: UpdatePayoutStatusDto) {
    return this.sellerFinanceService.adminUpdatePayoutStatus(id, dto);
  }
}
