import { SellerApprovedPayload } from "../types/notification-payload.types";

export function sellerApprovedTemplate(payload: SellerApprovedPayload): {
  subject: string;
  html: string;
} {
  return {
    subject: `Your seller account has been approved`,
    html: `
      <h1>Welcome aboard, ${payload.storeName}!</h1>
      <p>Your seller account has been approved. You can now list products and start selling.</p>
    `,
  };
}
