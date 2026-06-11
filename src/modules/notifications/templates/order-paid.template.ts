import { OrderPaidPayload } from "../types/notification-payload.types";

export function orderPaidTemplate(payload: OrderPaidPayload): {
  subject: string;
  html: string;
} {
  return {
    subject: `Payment confirmed for order #${payload.orderNumber}`,
    html: `
      <h1>Payment Confirmed</h1>
      <p>We've received your payment of <strong>${payload.currency} ${payload.totalAmount}</strong> for order <strong>#${payload.orderNumber}</strong>.</p>
      <p>Your order is now being processed.</p>
    `,
  };
}
