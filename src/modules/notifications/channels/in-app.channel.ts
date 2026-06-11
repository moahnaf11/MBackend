import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import { NotificationEventType } from "../constants/notification-events";
import { NotificationChannel, NotificationStatus } from "../../../../generated/prisma/enums";
import { Prisma } from "../../../../generated/prisma/client";

@Injectable()
export class InAppChannel {
  constructor(private readonly prisma: PrismaService) {}

  async send(
    userId: string,
    eventType: NotificationEventType,
    body: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.notificationDelivery.create({
      data: {
        userId,
        channel: NotificationChannel.IN_APP,
        eventType,
        destination: userId, // for IN_APP, destination is the userId itself
        body,
        payload: payload as Prisma.InputJsonValue,
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      },
    });
  }
}
