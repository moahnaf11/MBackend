export interface OrderPlacedPayload {
  userId: string;
  orderId: string;
  orderNumber: string;
  totalAmount: string;
  currency: string;
}

export interface OrderPaidPayload {
  userId: string;
  orderId: string;
  orderNumber: string;
  totalAmount: string;
  currency: string;
}

export interface OrderShippedPayload {
  userId: string;
  orderId: string;
  orderNumber: string;
  carrier?: string;
  trackingNumber?: string;
}

export interface OrderDeliveredPayload {
  userId: string;
  orderId: string;
  orderNumber: string;
}

export interface OrderCancelledPayload {
  userId: string;
  orderId: string;
  orderNumber: string;
  reason?: string;
}

export interface ReturnRequestedPayload {
  userId: string;
  orderId: string;
  orderNumber: string;
  returnRequestId: string;
}

export interface ReturnApprovedPayload {
  userId: string;
  orderId: string;
  orderNumber: string;
  returnRequestId: string;
}

export interface RefundSucceededPayload {
  userId: string;
  orderId: string;
  orderNumber: string;
  amount: string;
  currency: string;
}

export interface SellerApprovedPayload {
  userId: string;
  sellerId: string;
  storeName: string;
}

export interface SellerRejectedPayload {
  userId: string;
  sellerId: string;
  storeName: string;
  reason?: string;
}

export interface PayoutPaidPayload {
  userId: string;
  sellerId: string;
  amount: string;
  currency: string;
  payoutId: string;
}

// outboxEventId is included on every member so the processor
// can do a precise single-row update instead of updateMany
export type NotificationJobData =
  | { eventType: "order.placed"; payload: OrderPlacedPayload; outboxEventId: string }
  | { eventType: "order.paid"; payload: OrderPaidPayload; outboxEventId: string }
  | { eventType: "order.shipped"; payload: OrderShippedPayload; outboxEventId: string }
  | { eventType: "order.delivered"; payload: OrderDeliveredPayload; outboxEventId: string }
  | { eventType: "order.cancelled"; payload: OrderCancelledPayload; outboxEventId: string }
  | { eventType: "return.requested"; payload: ReturnRequestedPayload; outboxEventId: string }
  | { eventType: "return.approved"; payload: ReturnApprovedPayload; outboxEventId: string }
  | { eventType: "refund.succeeded"; payload: RefundSucceededPayload; outboxEventId: string }
  | { eventType: "seller.approved"; payload: SellerApprovedPayload; outboxEventId: string }
  | { eventType: "seller.rejected"; payload: SellerRejectedPayload; outboxEventId: string }
  | { eventType: "payout.paid"; payload: PayoutPaidPayload; outboxEventId: string };
