import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { EXPIRE_RESERVATIONS_JOB, INVENTORY_QUEUE } from "./inventory.constants";
import { InventoryService } from "./inventory.service";

@Processor(INVENTORY_QUEUE)
export class InventoryProcessor extends WorkerHost {
  constructor(private readonly inventoryService: InventoryService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === EXPIRE_RESERVATIONS_JOB) {
      await this.inventoryService.expireReservations();
    }
  }
}
