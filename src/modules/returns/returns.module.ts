import { Module } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import { OrdersModule } from "../orders/orders.module";
import { ShipmentsModule } from "../shipments/shipments.module";
import { ReturnsController } from "./returns.controller";
import { ReturnsService } from "./returns.service";
import { PaymentsModule } from "../payments/payments.module";
import { InventoryModule } from "../inventory/inventory.module";

@Module({
  imports: [OrdersModule, ShipmentsModule, PaymentsModule, InventoryModule],
  controllers: [ReturnsController],
  providers: [ReturnsService, PrismaService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
