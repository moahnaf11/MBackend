import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { OrdersService } from "../orders/orders.service";
import { CreateShipmentDto } from "./dto/create-shipment.dto";
import { UpdateShipmentStatusDto } from "./dto/update-shipment-status.dto";

import { OrderStatus, ShipmentStatus } from "../../../generated/prisma/enums";

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  // ─────────────────────────────────────────────
  // CREATE SHIPMENT (SELLER FULFILLMENT)
  // ─────────────────────────────────────────────
  async createShipment(userId: string, dto: CreateShipmentDto) {
    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!sellerProfile) {
      throw new ForbiddenException("Seller profile not found.");
    }

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: true,
        shipments: {
          include: { items: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException("Order not found.");
    }

    // Only allow shipping if order is in fulfillment stage
    if (
      order.status !== OrderStatus.PAID &&
      order.status !== OrderStatus.PROCESSING &&
      order.status !== OrderStatus.PARTIALLY_SHIPPED
    ) {
      throw new BadRequestException("Order is not ready for shipping.");
    }

    // Map order items for quick lookup
    const orderItemsMap = new Map(order.items.map((i) => [i.id, i]));

    // Validate seller ownership + quantities
    for (const item of dto.items) {
      const orderItem = orderItemsMap.get(item.orderItemId);

      if (!orderItem) {
        throw new NotFoundException(`Order item ${item.orderItemId} not found.`);
      }

      if (orderItem.sellerId !== sellerProfile.id) {
        throw new ForbiddenException("You can only ship your own items.");
      }

      // Prevent overshipping
      const shippedQty = await this.getAlreadyShippedQuantity(item.orderItemId);

      const totalAfter = shippedQty + item.quantity;

      if (totalAfter > orderItem.quantity) {
        throw new BadRequestException(`Overshipping detected for item ${item.orderItemId}.`);
      }
    }

    // Create shipment + items in transaction
    const shipment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          orderId: dto.orderId,
          carrier: dto.carrier,
          trackingNumber: dto.trackingNumber,
          status: ShipmentStatus.SHIPPED,
          shippedAt: new Date(),
        },
      });

      await tx.shipmentItem.createMany({
        data: dto.items.map((item) => ({
          shipmentId: created.id,
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      });

      return created;
    });

    // Sync order status after shipment creation
    await this.syncOrderStatus(order.id);

    return this.findById(shipment.id);
  }

  async findByOrderId(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId, // 🔒 ensures buyer owns the order
      },
      select: {
        id: true,
      },
    });

    if (!order) {
      throw new NotFoundException("Order not found.");
    }

    return this.prisma.shipment.findMany({
      where: {
        orderId,
      },
      include: {
        items: {
          include: {
            orderItem: {
              select: {
                id: true,
                titleSnapshot: true,
                quantity: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  // ─────────────────────────────────────────────
  // FIND SHIPMENT
  // ─────────────────────────────────────────────
  async findById(id: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            orderItem: true,
          },
        },
        order: true,
      },
    });

    if (!shipment) {
      throw new NotFoundException("Shipment not found.");
    }

    return shipment;
  }

  // ─────────────────────────────────────────────
  // SELLER SHIPMENTS
  // ─────────────────────────────────────────────
  async findSellerShipments(userId: string) {
    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!sellerProfile) {
      throw new ForbiddenException("Seller profile not found.");
    }

    return this.prisma.shipment.findMany({
      where: {
        items: {
          some: {
            orderItem: {
              sellerId: sellerProfile.id,
            },
          },
        },
      },
      include: {
        items: {
          include: { orderItem: true },
        },
        order: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ─────────────────────────────────────────────
  // UPDATE SHIPMENT STATUS
  // ─────────────────────────────────────────────
  async updateStatus(id: string, dto: UpdateShipmentStatusDto) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
    });

    if (!shipment) {
      throw new NotFoundException("Shipment not found.");
    }

    await this.prisma.shipment.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === ShipmentStatus.DELIVERED && {
          deliveredAt: new Date(),
        }),
      },
    });

    await this.syncOrderStatus(shipment.orderId);

    return this.findById(id);
  }

  // ─────────────────────────────────────────────
  // ORDER STATUS SYNC ENGINE (CORE LOGIC)
  // ─────────────────────────────────────────────
  private async syncOrderStatus(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        shipments: {
          include: { items: true },
        },
      },
    });

    if (!order) return;

    // Build shipped quantities per order item
    const shippedMap = new Map<string, number>();

    for (const shipment of order.shipments) {
      for (const item of shipment.items) {
        shippedMap.set(item.orderItemId, (shippedMap.get(item.orderItemId) ?? 0) + item.quantity);
      }
    }

    const allFullyShipped = order.items.every(
      (item) => (shippedMap.get(item.id) ?? 0) >= item.quantity,
    );

    const anyShipped = order.items.some((item) => (shippedMap.get(item.id) ?? 0) > 0);

    const allDelivered =
      order.shipments.length > 0 &&
      order.shipments.every((s) => s.status === ShipmentStatus.DELIVERED);

    if (allDelivered) {
      await this.ordersService.updateStatus(order.id, {
        status: OrderStatus.DELIVERED,
        note: "All shipments delivered.",
      });
      return;
    }

    if (allFullyShipped) {
      await this.ordersService.updateStatus(order.id, {
        status: OrderStatus.SHIPPED,
        note: "All items shipped.",
      });
      return;
    }

    if (anyShipped) {
      await this.ordersService.updateStatus(order.id, {
        status: OrderStatus.PARTIALLY_SHIPPED,
        note: "Some items shipped.",
      });
    }
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private async getAlreadyShippedQuantity(orderItemId: string) {
    const result = await this.prisma.shipmentItem.aggregate({
      where: { orderItemId },
      _sum: { quantity: true },
    });

    return result._sum.quantity ?? 0;
  }
}
