import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow<string>("RESEND_API_KEY"));
  }

  async sendVerificationEmail(email: string, verificationUrl: string) {
    await this.resend.emails.send({
      from: this.config.getOrThrow<string>("EMAIL_FROM"),
      to: email,
      subject: "Verify your email",
      html: `
        <h1>Verify your email</h1>

        <p>Click the button below to verify your account.</p>

        <a
          href="${verificationUrl}"
          style="
            display:inline-block;
            padding:12px 20px;
            background:black;
            color:white;
            text-decoration:none;
            border-radius:8px;
          "
        >
          Verify Email
        </a>

        <p>This link will expire soon.</p>
      `,
    });
  }

  async sendEmailChangeVerificationEmail(email: string, verificationUrl: string) {
    await this.resend.emails.send({
      from: this.config.getOrThrow<string>("EMAIL_FROM"),
      to: email,
      subject: "Verify Your New Email",
      html: `
        <h1>Verify your email</h1>

        <p>Click the button below to verify your new email address.</p>

        <a
          href="${verificationUrl}"
          style="
            display:inline-block;
            padding:12px 20px;
            background:black;
            color:white;
            text-decoration:none;
            border-radius:8px;
          "
        >
          Verify New Email
        </a>

        <p>If you did not request an email change please ignore this email</p>
      `,
    });
  }

  async sendPasswordResetEmail(email: string, resetUrl: string) {
    await this.resend.emails.send({
      from: this.config.getOrThrow<string>("EMAIL_FROM"),
      to: email,
      subject: "Reset your password",
      html: `
        <h1>Reset your password</h1>
  
        <p>We received a request to reset your password.</p>
  
        <a
          href="${resetUrl}"
          style="
            display:inline-block;
            padding:12px 20px;
            background:red;
            color:white;
            text-decoration:none;
            border-radius:8px;
          "
        >
          Reset Password
        </a>
  
        <p>This link will expire soon. If you didn’t request this, you can ignore this email.</p>
      `,
    });
  }
}
