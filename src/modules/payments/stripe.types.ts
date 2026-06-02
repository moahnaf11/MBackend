import Stripe from "stripe";

/** Stripe SDK client instance (v22 CJS: use Stripe.Stripe, not Stripe). */
export type StripeClient = Stripe.Stripe;

/** Verified webhook payload from stripe.webhooks.constructEvent(). */
export type StripeEvent = ReturnType<StripeClient["webhooks"]["constructEvent"]>;

export type StripePaymentIntent = Awaited<
  ReturnType<StripeClient["paymentIntents"]["retrieve"]>
>;

export type StripeCharge = Awaited<ReturnType<StripeClient["charges"]["retrieve"]>>;
