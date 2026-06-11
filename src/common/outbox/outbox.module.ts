import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { OutboxService } from "./outbox.service";
import { NOTIFICATION_QUEUE } from "../../modules/notifications/notifications.constants";

@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATION_QUEUE })],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
