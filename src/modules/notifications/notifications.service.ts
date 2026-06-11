import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { UpdatePreferenceDto } from "./dto/update-preference.dto";
import { DeliveryQueryDto } from "./dto/delivery-query.dto";
import { NotificationChannel, NotificationStatus } from "../../../generated/prisma/enums";


@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Preferences ────────────────────────────────────────────────

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: [{ channel: "asc" }, { eventType: "asc" }],
    });
  }

  async upsertPreference(userId: string, dto: UpdatePreferenceDto) {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId_channel_eventType: {
          userId,
          channel: dto.channel,
          eventType: dto.eventType,
        },
      },
      update: { enabled: dto.enabled },
      create: {
        userId,
        channel: dto.channel,
        eventType: dto.eventType,
        enabled: dto.enabled,
      },
    });
  }

  // ─── Deliveries (IN_APP inbox) ───────────────────────────────────

  async getDeliveries(userId: string, query: DeliveryQueryDto) {
    const { channel, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(channel ? { channel } : { channel: NotificationChannel.IN_APP }),
    };

    const [items, total] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notificationDelivery.count({
      where: {
        userId,
        channel: NotificationChannel.IN_APP,
        status: { not: NotificationStatus.READ },
      },
    });
    return { count };
  }

  async markAsRead(deliveryId: string, userId: string) {
    return this.prisma.notificationDelivery.updateMany({
      where: { id: deliveryId, userId },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notificationDelivery.updateMany({
      where: {
        userId,
        channel: NotificationChannel.IN_APP,
        status: { not: NotificationStatus.READ },
      },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }
}
