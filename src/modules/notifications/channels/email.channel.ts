import { Injectable, Logger } from "@nestjs/common";
import { EmailService } from "../../email/email.service";

@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);

  constructor(private readonly emailService: EmailService) {}

  async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.emailService.sendMail(to, subject, html);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err}`);
      throw err; // rethrow so BullMQ can retry the job
    }
  }
}
