import { ReturnApprovedPayload } from "../types/notification-payload.types";

export function returnApprovedTemplate(payload: ReturnApprovedPayload): {
  subject: string;
  html: string;
} {
  return {
    subject: `Your return request has been approved`,
    html: `
      <h1>Return Approved</h1>
      <p>Your return request for order <strong>#${payload.orderNumber}</strong> has been approved.</p>
      <p>Please ship the item(s) back using the provided instructions.</p>
    `,
  };
}
