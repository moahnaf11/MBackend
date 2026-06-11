export const NotificationEvents = {
  // Orders
  ORDER_PLACED: "order.placed",
  ORDER_PAID: "order.paid",
  ORDER_SHIPPED: "order.shipped",
  ORDER_DELIVERED: "order.delivered",
  ORDER_CANCELLED: "order.cancelled",

  // Returns & Refunds
  RETURN_REQUESTED: "return.requested",
  RETURN_APPROVED: "return.approved",
  REFUND_SUCCEEDED: "refund.succeeded",

  // Seller
  SELLER_APPROVED: "seller.approved",
  SELLER_REJECTED: "seller.rejected",
  PAYOUT_PAID: "payout.paid",
} as const;

export type NotificationEventType = (typeof NotificationEvents)[keyof typeof NotificationEvents];
