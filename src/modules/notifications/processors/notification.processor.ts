import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { Logger } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import { NOTIFICATION_QUEUE, DISPATCH_NOTIFICATION_JOB } from "../notifications.constants";
import { EmailChannel } from "../channels/email.channel";
import { InAppChannel } from "../channels/in-app.channel";
import { getTemplate } from "../templates";
import { NotificationJobData } from "../types/notification-payload.types";
import { NotificationChannel } from "../../../../generated/prisma/enums";

@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailChannel: EmailChannel,
    private readonly inAppChannel: InAppChannel,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    if (job.name !== DISPATCH_NOTIFICATION_JOB) return;

    const { eventType, payload, outboxEventId } = job.data;
    const userId = (payload as { userId?: string }).userId;

    if (!userId) {
      this.logger.warn(`No userId in payload for event ${eventType}, skipping`);
      return;
    }

    // 1. Fetch user email + enabled preferences for this event
    const [user, preferences] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      }),
      this.prisma.notificationPreference.findMany({
        where: { userId, eventType, enabled: true },
      }),
    ]);

    if (!user) {
      this.logger.warn(`User ${userId} not found, skipping notification`);
      return;
    }

    // 2. Determine enabled channels — default to EMAIL + IN_APP if no prefs set
    const enabledChannels =
      preferences.length > 0
        ? preferences.map((p) => p.channel)
        : [NotificationChannel.EMAIL, NotificationChannel.IN_APP];

    // 3. Render template — always resolves, no null check needed
    const template = getTemplate(eventType, payload as unknown as Record<string, unknown>);

    // 4. Dispatch per channel
    for (const channel of enabledChannels) {
      if (channel === NotificationChannel.EMAIL) {
        await this.emailChannel.send(user.email, template.subject, template.html);
      }

      if (channel === NotificationChannel.IN_APP) {
        await this.inAppChannel.send(
          userId,
          eventType,
          template.html,
          payload as unknown as Record<string, unknown>,
        );
      }

      if (channel === NotificationChannel.SMS) {
        this.logger.warn(`SMS channel not yet implemented — skipping for user ${userId}`);
      }

      if (channel === NotificationChannel.PUSH) {
        this.logger.warn(`Push channel not yet implemented — skipping for user ${userId}`);
      }
    }

    // 5. Mark the exact OutboxEvent row as PROCESSED using its ID
    await this.prisma.outboxEvent.update({
      where: { id: outboxEventId },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  }
}
