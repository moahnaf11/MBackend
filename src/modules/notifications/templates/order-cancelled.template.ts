import { OrderCancelledPayload } from "../types/notification-payload.types";

export function orderCancelledTemplate(payload: OrderCancelledPayload): {
  subject: string;
  html: string;
} {
  const reasonLine = payload.reason ? `<p>Reason: ${payload.reason}</p>` : "";

  return {
    subject: `Your order #${payload.orderNumber} has been cancelled`,
    html: `
      <h1>Order Cancelled</h1>
      <p>Your order <strong>#${payload.orderNumber}</strong> has been cancelled.</p>
      ${reasonLine}
      <p>If you were charged, a refund will be processed shortly.</p>
    `,
  };
}
