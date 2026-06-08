import { Module } from "@nestjs/common";

import { SellerFinanceService } from "./seller-finance.service";
import { AdminPayoutsController, SellerFinanceController } from "./seller-finance.controller";


@Module({
  controllers: [SellerFinanceController, AdminPayoutsController],
  providers: [SellerFinanceService],
  exports: [SellerFinanceService],
  // SellerFinanceService is exported so OrdersService can call
  // createRefundLedgerEntries() when an order is refunded.
})
export class SellerFinanceModule {}
