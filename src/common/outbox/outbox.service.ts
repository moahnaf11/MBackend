import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { PrismaService } from "../../database/prisma.service";
import {
  NOTIFICATION_QUEUE,
  DISPATCH_NOTIFICATION_JOB,
} from "../../modules/notifications/notifications.constants";
import type { NotificationEventType } from "../../modules/notifications/constants/notification-events";
import { Prisma } from "../../../generated/prisma/client";

@Injectable()
export class OutboxService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notificationsQueue: Queue,
  ) {}

  async emit(
    eventType: NotificationEventType,
    payload: Record<string, unknown>,
    aggregateId: string,
    aggregateType: string,
  ): Promise<void> {
    // 1. Write to OutboxEvent for audit trail — capture the ID
    const outboxEvent = await this.prisma.outboxEvent.create({
      data: {
        eventType,
        aggregateId,
        aggregateType,
        payload: payload as Prisma.InputJsonValue,
        status: "PENDING",
      },
    });

    // 2. Push to BullMQ with the outbox row ID attached
    await this.notificationsQueue.add(
      DISPATCH_NOTIFICATION_JOB,
      {
        eventType,
        payload,
        outboxEventId: outboxEvent.id,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5_000,
        },
        removeOnComplete: true,
        removeOnFail: 1_000,
      },
    );
  }
}
