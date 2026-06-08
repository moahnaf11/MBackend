import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

import { OrdersModule } from "../orders/orders.module";
import { StripeWebhookGuard } from "./guards/stripe-webhook.guard";
import { SellerFinanceModule } from "../seller-finance/seller-finance.module";
import { InventoryModule } from "../inventory/inventory.module";

/**
 * IMPORTANT — Raw body middleware for webhook signature verification.
 *
 * Add the following to main.ts BEFORE app.useGlobalPipes() and any global
 * JSON body parser:
 *
 *   import * as express from 'express';
 *
 *   // Raw body for Stripe webhook — must come before the global JSON parser.
 *   app.use('/payments/webhook', express.raw({ type: 'application/json' }));
 *
 * NestJS registers a global JSON body parser by default. The raw middleware
 * intercepts only the webhook path and stores the raw Buffer on req.rawBody
 * before NestJS processes the request. Without this the HMAC signature check
 * in StripeWebhookGuard will always fail.
 *
 * Also add to main.ts to expose rawBody:
 *   const app = await NestFactory.create(AppModule, { rawBody: true });
 *
 * With rawBody: true, NestJS attaches the raw Buffer to req.rawBody for all
 * routes automatically, which is simpler than a custom middleware.
 * StripeWebhookGuard reads req.rawBody directly.
 */
@Module({
  imports: [OrdersModule, SellerFinanceModule, InventoryModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeWebhookGuard],
  exports: [PaymentsService, PaymentsModule],
})
export class PaymentsModule {}
