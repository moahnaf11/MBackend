import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";

import { StripeClient } from "../stripe.types";

/**
 * Verifies the Stripe-Signature header against the raw request body.
 *
 * IMPORTANT: This guard requires the raw unparsed body to be attached to the
 * request as `req.rawBody` (Buffer). This is wired in main.ts via a custom
 * body parser middleware — see payments.module.ts for the setup note.
 *
 * Must be applied ONLY to the webhook route. Never apply JwtAuthGuard to the
 * webhook endpoint — Stripe cannot send a JWT.
 */
@Injectable()
export class StripeWebhookGuard implements CanActivate {
  private readonly webhookSecret: string;
  private readonly stripe: StripeClient;

  constructor(private readonly config: ConfigService) {
    this.webhookSecret = this.config.getOrThrow<string>("STRIPE_WEBHOOK_SECRET");
    this.stripe = new Stripe(this.config.getOrThrow<string>("STRIPE_SECRET_KEY"));
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const signature = req.headers["stripe-signature"];
    const rawBody: Buffer = req.rawBody;

    if (!signature) {
      throw new UnauthorizedException("Missing Stripe-Signature header.");
    }

    if (!rawBody) {
      throw new UnauthorizedException(
        "Raw body not available — ensure rawBody middleware is configured in main.ts.",
      );
    }

    try {
      // constructEvent throws if the signature is invalid or the timestamp is
      // outside the tolerance window (default 300 seconds).
      const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);

      // Attach the verified event to the request so the controller can use it
      // without re-parsing the body.
      req.stripeEvent = event;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid Stripe webhook signature.");
    }
  }
}
