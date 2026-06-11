import { ReturnRequestedPayload } from "../types/notification-payload.types";

export function returnRequestedTemplate(payload: ReturnRequestedPayload): {
  subject: string;
  html: string;
} {
  return {
    subject: `Return request received for order #${payload.orderNumber}`,
    html: `
      <h1>Return Request Received</h1>
      <p>We've received your return request for order <strong>#${payload.orderNumber}</strong>.</p>
      <p>Our team will review it and get back to you shortly.</p>
    `,
  };
}
