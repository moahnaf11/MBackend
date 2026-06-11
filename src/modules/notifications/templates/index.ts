import { NotificationEventType } from "../constants/notification-events";
import { orderPlacedTemplate } from "./order-placed.template";
import { orderPaidTemplate } from "./order-paid.template";
import { orderShippedTemplate } from "./order-shipped.template";
import { orderDeliveredTemplate } from "./order-delivered.template";
import { orderCancelledTemplate } from "./order-cancelled.template";
import { returnRequestedTemplate } from "./return-requested.template";
import { returnApprovedTemplate } from "./return-approved.template";
import { refundSucceededTemplate } from "./refund-succeeded.template";
import { sellerApprovedTemplate } from "./seller-approved.template";
import { sellerRejectedTemplate } from "./seller-rejected.template";

type TemplateResult = { subject: string; html: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const templateRegistry: Record<NotificationEventType, (payload: any) => TemplateResult> = {
  "order.placed": orderPlacedTemplate,
  "order.paid": orderPaidTemplate,
  "order.shipped": orderShippedTemplate,
  "order.delivered": orderDeliveredTemplate,
  "order.cancelled": orderCancelledTemplate,
  "return.requested": returnRequestedTemplate,
  "return.approved": returnApprovedTemplate,
  "refund.succeeded": refundSucceededTemplate,
  "seller.approved": sellerApprovedTemplate,
  "seller.rejected": sellerRejectedTemplate,
  "payout.paid": refundSucceededTemplate, // reuse shape — add dedicated template later
};

export function getTemplate(
  eventType: NotificationEventType,
  payload: Record<string, unknown>,
): TemplateResult {
  return templateRegistry[eventType](payload);
}
