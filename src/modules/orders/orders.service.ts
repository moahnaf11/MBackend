import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  CartStatus,
  InventoryReservationStatus,
  OrderStatus,
  ProductStatus,
  SellerLedgerEntryType,
} from "../../../generated/prisma/enums";
import { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { PromotionsService } from "../promotions/promotions.service";
import { CreateOrderFromCartDto } from "./dto/create-order-from-cart.dto";
import { ListOrdersDto } from "./dto/list-orders.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";

const orderInclude = {
  items: {
    include: {
      variant: {
        select: {
          id: true,
          sku: true,
          title: true,
          images: { orderBy: { sortOrder: "asc" } },
          product: {
            select: {
              id: true,
              title: true,
              slug: true,
              images: {
                where: { variantId: null },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
      seller: {
        select: {
          id: true,
          storeName: true,
          slug: true,
          logoUrl: true,
        },
      },
      reservations: {
        select: {
          id: true,
          status: true,
          quantity: true,
          expiresAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  statusEvents: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { createdAt: "desc" } },
  shipments: {
    include: { items: true },
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.OrderInclude;

type OrderTransaction = Prisma.TransactionClient;

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.REFUNDED],
  [OrderStatus.PROCESSING]: [
    OrderStatus.PARTIALLY_SHIPPED,
    OrderStatus.SHIPPED,
    OrderStatus.REFUNDED,
  ],
  [OrderStatus.PARTIALLY_SHIPPED]: [OrderStatus.SHIPPED, OrderStatus.REFUNDED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.REFUNDED],
  [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
};

@Injectable()
export class OrdersService {
  private readonly marketplaceCommissionRate = new Prisma.Decimal("0.10");

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly promotionsService: PromotionsService,
  ) {}

  async createFromCart(userId: string, dto: CreateOrderFromCartDto) {
    const orderId = await this.prisma.$transaction(
      async (tx) => {
        const cart = await tx.cart.findFirst({
          where: { userId, status: CartStatus.ACTIVE },
          include: {
            items: {
              include: {
                reservations: {
                  where: { status: InventoryReservationStatus.ACTIVE },
                  select: { quantity: true },
                },
                variant: {
                  include: {
                    product: {
                      select: {
                        id: true,
                        title: true,
                        status: true,
                        sellerId: true,
                        categories: { select: { categoryId: true } },
                      },
                    },
                  },
                },
              },
              orderBy: { addedAt: "asc" },
            },
          },
        });

        if (!cart || cart.items.length === 0) {
          throw new BadRequestException("Your cart is empty.");
        }

        this.ensureSingleCurrency(cart.items.map((item) => item.variant.currency));

        const shippingAddress = await this.findAddressForUser(tx, userId, dto.shippingAddressId);
        const billingAddress = dto.billingAddressId
          ? await this.findAddressForUser(tx, userId, dto.billingAddressId)
          : shippingAddress;

        for (const item of cart.items) {
          if (!item.variant.isActive || item.variant.product.status !== ProductStatus.ACTIVE) {
            throw new ConflictException("One or more cart items are no longer available.");
          }

          await this.inventoryService.replaceCartItemReservations(
            tx,
            item.id,
            item.variantId,
            item.quantity,
          );
        }

        const subtotalAmount = cart.items.reduce(
          (total, item) => total.plus(new Prisma.Decimal(item.variant.price).mul(item.quantity)),
          new Prisma.Decimal(0),
        );
        const shippingAmount = new Prisma.Decimal(0);
        const taxAmount = new Prisma.Decimal(0);
        const discount = await this.promotionsService.calculateCartDiscount(tx, {
          userId,
          cart,
          shippingAmount,
        });
        const discountAmount = discount.discountAmount;
        const totalAmount = subtotalAmount.plus(shippingAmount).plus(taxAmount).minus(discountAmount);

        const order = await tx.order.create({
          data: {
            orderNumber: this.generateOrderNumber(),
            userId,
            status: OrderStatus.PENDING_PAYMENT,
            currency: cart.items[0]?.variant.currency ?? "USD",
            subtotalAmount,
            shippingAmount,
            taxAmount,
            discountAmount,
            totalAmount,
            shippingAddress: this.snapshotAddress(shippingAddress),
            billingAddress: this.snapshotAddress(billingAddress),
            statusEvents: {
              create: {
                toStatus: OrderStatus.PENDING_PAYMENT,
                note: "Order created from cart.",
              },
            },
          },
          select: { id: true },
        });

        await this.promotionsService.createOrderRedemption(tx, {
          discount,
          userId,
          cartId: cart.id,
          orderId: order.id,
        });

        for (const item of cart.items) {
          const unitPrice = new Prisma.Decimal(item.variant.price);
          const totalItemAmount = unitPrice.mul(item.quantity);
          const commissionAmount = totalItemAmount
            .mul(this.marketplaceCommissionRate)
            .toDecimalPlaces(2);
          const sellerPayoutAmount = totalItemAmount.minus(commissionAmount);
          const titleSnapshot = `${item.variant.product.title} - ${item.variant.title}`;

          const orderItem = await tx.orderItem.create({
            data: {
              orderId: order.id,
              variantId: item.variantId,
              sellerId: item.variant.product.sellerId,
              skuSnapshot: item.variant.sku,
              titleSnapshot,
              unitPrice,
              quantity: item.quantity,
              totalAmount: totalItemAmount,
              commissionAmount,
              sellerPayoutAmount,
            },
            select: { id: true },
          });

          await this.ensureCartItemIsFullyReserved(tx, item.id, item.quantity);
          await this.inventoryService.moveCartItemReservationsToOrderItem(
            tx,
            item.id,
            orderItem.id,
          );
        }

        await tx.cart.update({
          where: { id: cart.id },
          data: { status: CartStatus.CHECKED_OUT },
        });

        return order.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.findMineById(userId, orderId);
  }

  async findMine(userId: string, query: ListOrdersDto) {
    return this.findMany({ ...query, userId });
  }

  async findMineById(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException("Order not found.");
    }

    return order;
  }

  async cancelMine(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, userId },
        include: { items: { select: { id: true } } },
      });

      if (!order) {
        throw new NotFoundException("Order not found.");
      }

      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw new BadRequestException("Only pending-payment orders can be cancelled by customers.");
      }

      for (const item of order.items) {
        await this.inventoryService.releaseOrderItemReservations(tx, item.id);
      }

      await tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED },
      });

      await tx.orderStatusEvent.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: OrderStatus.CANCELLED,
          note: "Cancelled by customer.",
        },
      });
    });

    return this.findMineById(userId, id);
  }

  async findSellerOrders(userId: string, query: ListOrdersDto) {
    const sellerId = await this.resolveSellerProfileId(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.OrderWhereInput = {
      ...(query.status && { status: query.status }),
      items: { some: { sellerId } },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: this.getSellerOrderInclude(sellerId),
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { placedAt: "desc" },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findSellerOrderById(userId: string, id: string) {
    const sellerId = await this.resolveSellerProfileId(userId);
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        items: { some: { sellerId } },
      },
      include: this.getSellerOrderInclude(sellerId),
    });

    if (!order) {
      throw new NotFoundException("Order not found.");
    }

    return order;
  }

  async findAll(query: ListOrdersDto) {
    return this.findMany(query);
  }

  async findById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException("Order not found.");
    }

    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: { select: { id: true, quantity: true } } },
      });

      if (!order) {
        throw new NotFoundException("Order not found.");
      }

      if (order.status === dto.status) {
        return;
      }

      this.ensureValidStatusTransition(order.status, dto.status);

      if (dto.status === OrderStatus.CANCELLED) {
        for (const item of order.items) {
          await this.inventoryService.releaseOrderItemReservations(tx, item.id);
        }
      }

      if (dto.status === OrderStatus.PAID) {
        for (const item of order.items) {
          await this.inventoryService.consumeOrderItemReservations(tx, item.id, item.quantity);
        }
      }

      await tx.order.update({
        where: { id },
        data: { status: dto.status },
      });

      await tx.orderStatusEvent.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: dto.status,
          note: dto.note,
          ...(dto.metadata !== undefined && { metadata: dto.metadata as Prisma.InputJsonValue }),
        },
      });

      if (dto.status === OrderStatus.PAID) {
        await this.createSellerLedgerEntriesForPaidOrder(tx, id);
      }
    });

    return this.findById(id);
  }

  private async findMany(query: ListOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.OrderWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.userId && { userId: query.userId }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { placedAt: "desc" },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private getSellerOrderInclude(sellerId: string): Prisma.OrderInclude {
    return {
      ...orderInclude,
      items: {
        ...orderInclude.items,
        where: { sellerId },
      },
    };
  }

  private async resolveSellerProfileId(userId: string): Promise<string> {
    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!sellerProfile) {
      throw new ForbiddenException("No seller profile found for this account.");
    }

    return sellerProfile.id;
  }

  private async findAddressForUser(tx: OrderTransaction, userId: string, addressId: string) {
    const address = await tx.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException("Address not found.");
    }

    return address;
  }

  private async ensureCartItemIsFullyReserved(
    tx: OrderTransaction,
    cartItemId: string,
    quantity: number,
  ) {
    const result = await tx.inventoryReservation.aggregate({
      where: {
        cartItemId,
        status: InventoryReservationStatus.ACTIVE,
      },
      _sum: { quantity: true },
    });

    if ((result._sum.quantity ?? 0) < quantity) {
      throw new ConflictException("One or more cart items could not be reserved.");
    }
  }

  private async createSellerLedgerEntriesForPaidOrder(tx: OrderTransaction, orderId: string) {
    const orderItems = await tx.orderItem.findMany({
      where: { orderId },
      select: {
        id: true,
        sellerId: true,
        totalAmount: true,
        commissionAmount: true,
        order: { select: { currency: true } },
      },
    });

    for (const item of orderItems) {
      const existingLedgerEntry = await tx.sellerLedgerEntry.findFirst({
        where: {
          orderItemId: item.id,
          type: SellerLedgerEntryType.ORDER_ITEM_SALE,
        },
        select: { id: true },
      });

      if (existingLedgerEntry) {
        continue;
      }

      await tx.sellerLedgerEntry.createMany({
        data: [
          {
            sellerId: item.sellerId,
            orderItemId: item.id,
            type: SellerLedgerEntryType.ORDER_ITEM_SALE,
            amount: item.totalAmount,
            currency: item.order.currency,
            description: "Order item sale.",
          },
          {
            sellerId: item.sellerId,
            orderItemId: item.id,
            type: SellerLedgerEntryType.COMMISSION,
            amount: item.commissionAmount.negated(),
            currency: item.order.currency,
            description: "Marketplace commission.",
          },
        ],
      });
    }
  }

  private ensureSingleCurrency(currencies: string[]): void {
    const uniqueCurrencies = new Set(currencies);

    if (uniqueCurrencies.size > 1) {
      throw new BadRequestException("Cart contains items with different currencies.");
    }
  }

  private ensureValidStatusTransition(fromStatus: OrderStatus, toStatus: OrderStatus): void {
    const allowedStatuses = ORDER_STATUS_TRANSITIONS[fromStatus];

    if (!allowedStatuses.includes(toStatus)) {
      throw new BadRequestException(
        `Order status cannot transition from ${fromStatus} to ${toStatus}.`,
      );
    }
  }

  private snapshotAddress(address: {
    fullName: string;
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string;
    country: string;
    phone: string | null;
  }): Prisma.JsonObject {
    return {
      fullName: address.fullName,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
      phone: address.phone,
    };
  }

  private generateOrderNumber(): string {
    const datePrefix = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const randomSuffix = randomUUID().slice(0, 8).toUpperCase();

    return `ORD-${datePrefix}-${randomSuffix}`;
  }
}
