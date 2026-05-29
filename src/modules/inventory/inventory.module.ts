import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { InventoryController } from "./inventory.controller";
import { INVENTORY_QUEUE } from "./inventory.constants";
import { InventoryProcessor } from "./inventory.processor";
import { InventoryScheduler } from "./inventory.scheduler";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [BullModule.registerQueue({ name: INVENTORY_QUEUE })],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryProcessor, InventoryScheduler],
  exports: [InventoryService],
})
export class InventoryModule {}
