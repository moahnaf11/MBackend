import { RefundSucceededPayload } from "../types/notification-payload.types";

export function refundSucceededTemplate(payload: RefundSucceededPayload): {
  subject: string;
  html: string;
} {
  return {
    subject: `Refund processed for order #${payload.orderNumber}`,
    html: `
      <h1>Refund Processed</h1>
      <p>A refund of <strong>${payload.currency} ${payload.amount}</strong> for order <strong>#${payload.orderNumber}</strong> has been processed.</p>
      <p>It may take 3–5 business days to appear on your statement.</p>
    `,
  };
}
