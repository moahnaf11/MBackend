import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  EXPIRE_RESERVATIONS_INTERVAL_MS,
  EXPIRE_RESERVATIONS_JOB,
  EXPIRE_RESERVATIONS_SCHEDULER,
  INVENTORY_QUEUE,
} from "./inventory.constants";

@Injectable()
export class InventoryScheduler implements OnModuleInit {
  constructor(@InjectQueue(INVENTORY_QUEUE) private readonly inventoryQueue: Queue) {}

  async onModuleInit() {
    await this.inventoryQueue.upsertJobScheduler(
      EXPIRE_RESERVATIONS_SCHEDULER,
      { every: EXPIRE_RESERVATIONS_INTERVAL_MS },
      {
        name: EXPIRE_RESERVATIONS_JOB,
        data: {},
        opts: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5_000,
          },
          removeOnComplete: true,
          removeOnFail: 1_000,
        },
      },
    );
  }
}
