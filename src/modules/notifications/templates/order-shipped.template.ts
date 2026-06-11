import { OrderShippedPayload } from "../types/notification-payload.types";

export function orderShippedTemplate(payload: OrderShippedPayload): {
  subject: string;
  html: string;
} {
  const trackingLine = payload.trackingNumber
    ? `<p>Tracking number: <strong>${payload.trackingNumber}</strong> via ${payload.carrier}</p>`
    : "";

  return {
    subject: `Your order #${payload.orderNumber} has shipped`,
    html: `
      <h1>Your order is on its way!</h1>
      <p>Order <strong>#${payload.orderNumber}</strong> has been shipped.</p>
      ${trackingLine}
    `,
  };
}
