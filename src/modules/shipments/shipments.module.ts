import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { OrdersModule } from "../orders/orders.module";
import { ShipmentsService } from "./shipments.service";
import { ShipmentsController } from "./shipments.controller";

@Module({
  imports: [OrdersModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService, PrismaService],
  exports: [ShipmentsService, ShipmentsModule],
})
export class ShipmentsModule {}
