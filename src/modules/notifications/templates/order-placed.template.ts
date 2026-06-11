import { OrderPlacedPayload } from "../types/notification-payload.types";

export function orderPlacedTemplate(payload: OrderPlacedPayload): {
  subject: string;
  html: string;
} {
  return {
    subject: `Order Confirmed — #${payload.orderNumber}`,
    html: `
      <h1>Thanks for your order!</h1>
      <p>Your order <strong>#${payload.orderNumber}</strong> has been placed successfully.</p>
      <p>Total: <strong>${payload.currency} ${payload.totalAmount}</strong></p>
      <p>We'll notify you once it ships.</p>
    `,
  };
}
