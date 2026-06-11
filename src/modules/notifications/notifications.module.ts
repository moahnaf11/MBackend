import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationProcessor } from "./processors/notification.processor";
import { EmailChannel } from "./channels/email.channel";
import { InAppChannel } from "./channels/in-app.channel";
import { EmailModule } from "../email/email.module";
import { NOTIFICATION_QUEUE } from "./notifications.constants";

@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATION_QUEUE }), EmailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationProcessor, EmailChannel, InAppChannel],
  exports: [NotificationsService],
})
export class NotificationsModule {}
