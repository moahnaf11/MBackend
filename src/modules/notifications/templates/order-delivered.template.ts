import { OrderDeliveredPayload } from "../types/notification-payload.types";

export function orderDeliveredTemplate(payload: OrderDeliveredPayload): {
  subject: string;
  html: string;
} {
  return {
    subject: `Your order #${payload.orderNumber} has been delivered`,
    html: `
      <h1>Order Delivered</h1>
      <p>Your order <strong>#${payload.orderNumber}</strong> has been delivered.</p>
      <p>Enjoying your purchase? Leave a review!</p>
    `,
  };
}
