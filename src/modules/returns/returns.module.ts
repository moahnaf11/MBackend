import { Module } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import { OrdersModule } from "../orders/orders.module";
import { ShipmentsModule } from "../shipments/shipments.module";
import { ReturnsController } from "./returns.controller";
import { ReturnsService } from "./returns.service";

@Module({
  imports: [OrdersModule, ShipmentsModule],
  controllers: [ReturnsController],
  providers: [ReturnsService, PrismaService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
