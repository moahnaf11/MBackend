import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { SellerFinanceModule } from "../seller-finance/seller-finance.module";

@Module({
  imports: [InventoryModule, PromotionsModule, SellerFinanceModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
