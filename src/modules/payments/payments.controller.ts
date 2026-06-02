import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../users/guards/roles.guard";
import { Roles } from "../users/guards/roles.decorator";
import { PaymentsService } from "./payments.service";
import { StripeWebhookGuard } from "./guards/stripe-webhook.guard";
import { AuthenticatedRequest } from "../auth/types/auth.types";
import { CreatePaymentIntentDto } from "./dto/create-payment-intent.dto";
import { UserRole } from "../../../generated/prisma/enums";
import { CreateRefundDto } from "./dto/create-refund.dto";
import { StripeEvent } from "./stripe.types";


@ApiTags("payments")
@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ─── WEBHOOK ──────────────────────────────────────────────────────────────

  // POST /payments/webhook
  // No JwtAuthGuard — Stripe cannot send a JWT.
  // StripeWebhookGuard verifies the Stripe-Signature header instead.
  // MUST be declared first so NestJS does not try to parse the raw body
  // as JSON before this route is matched.
  //
  // Webhook raw body setup (add to main.ts):
  //
  //   app.use('/payments/webhook', express.raw({ type: 'application/json' }));
  //
  // This must be registered BEFORE app.useGlobalPipes / app.use(express.json()).
  // Without raw body, Stripe signature verification will always fail.
  @Post("webhook")
  @UseGuards(StripeWebhookGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Stripe webhook receiver",
    description:
      "Receives and processes Stripe webhook events. Stripe-Signature header is verified via HMAC. Do not call this endpoint directly.",
  })
  @ApiOkResponse({ description: "Event acknowledged" })
  async handleWebhook(@Req() req: { stripeEvent: StripeEvent }) {
    await this.paymentsService.handleWebhook(req.stripeEvent);
    return { received: true };
  }

  // ─── PAYMENT INTENT ───────────────────────────────────────────────────────

  // POST /payments/orders/:orderId/intent
  // Creates a Stripe PaymentIntent for the given order.
  // Idempotent — returns the existing intent if one is already pending.
  @Post("orders/:orderId/intent")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create a payment intent for an order",
    description:
      "Creates a Stripe PaymentIntent and returns the client_secret for frontend confirmation. Idempotent — safe to call multiple times for the same order.",
  })
  @ApiParam({ name: "orderId", description: "Order cuid" })
  @ApiCreatedResponse({ description: "Client secret and payment attempt id" })
  createIntent(
    @Req() req: AuthenticatedRequest,
    @Param("orderId") orderId: string,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return this.paymentsService.createIntent(req.user.id, orderId, dto);
  }

  // ─── CUSTOMER QUERIES ─────────────────────────────────────────────────────

  // GET /payments/orders/:orderId
  // Lists payment attempts for an order owned by the authenticated user.
  @Get("orders/:orderId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "List payment attempts for an order",
    description: "Returns all payment attempts for one of the authenticated user's orders.",
  })
  @ApiParam({ name: "orderId", description: "Order cuid" })
  @ApiOkResponse({ description: "List of payment attempts with refunds" })
  findAttemptsForOrder(@Req() req: AuthenticatedRequest, @Param("orderId") orderId: string) {
    return this.paymentsService.findAttemptsForOrder(req.user.id, orderId);
  }

  // ─── ADMIN ROUTES ─────────────────────────────────────────────────────────

  // GET /payments/attempts/:attemptId
  @Get("attempts/:attemptId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get a payment attempt by id (admin/support)" })
  @ApiParam({ name: "attemptId", description: "PaymentAttempt cuid" })
  @ApiOkResponse({ description: "Payment attempt detail with refunds" })
  findAttemptById(@Param("attemptId") attemptId: string) {
    return this.paymentsService.findAttemptById(attemptId);
  }

  // POST /payments/orders/:orderId/refund
  // Admin-initiated refund. Customers initiate refunds via the returns flow.
  @Post("orders/:orderId/refund")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Issue a refund for an order (admin only)",
    description:
      "Creates a Stripe refund and a Refund DB record in PROCESSING status. Transitions to SUCCEEDED when Stripe fires the charge.refunded webhook. Customers should use the returns flow instead.",
  })
  @ApiParam({ name: "orderId", description: "Order cuid" })
  @ApiCreatedResponse({ description: "The created Refund record" })
  createRefund(@Param("orderId") orderId: string, @Body() dto: CreateRefundDto) {
    return this.paymentsService.createRefund(orderId, dto);
  }
}
