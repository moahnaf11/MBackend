import { SellerRejectedPayload } from "../types/notification-payload.types";

export function sellerRejectedTemplate(payload: SellerRejectedPayload): {
  subject: string;
  html: string;
} {
  const reasonLine = payload.reason ? `<p>Reason: ${payload.reason}</p>` : "";

  return {
    subject: `Your seller application was not approved`,
    html: `
      <h1>Application Not Approved</h1>
      <p>Unfortunately your seller application for <strong>${payload.storeName}</strong> was not approved at this time.</p>
      ${reasonLine}
      <p>Please contact support if you have questions.</p>
    `,
  };
}
