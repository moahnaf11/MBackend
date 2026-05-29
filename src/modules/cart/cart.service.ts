import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CartStatus, InventoryReservationStatus, ProductStatus } from "../../../generated/prisma/enums";
import { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { AddCartItemDto } from "./dto/add-cart-item.dto";
import { ApplyCartCouponDto } from "./dto/apply-cart-coupon.dto";
import { UpdateCartItemDto } from "./dto/update-cart-item.dto";

const cartInclude = {
  items: {
    include: {
      reservations: {
        where: { status: InventoryReservationStatus.ACTIVE },
        select: {
          id: true,
          quantity: true,
          expiresAt: true,
        },
      },
      variant: {
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          product: {
            select: {
              id: true,
              title: true,
              slug: true,
              status: true,
              images: {
                where: { variantId: null },
                orderBy: { sortOrder: "asc" },
              },
              brand: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  logoUrl: true,
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
            },
          },
        },
      },
    },
    orderBy: { addedAt: "asc" },
  },
} satisfies Prisma.CartInclude;

type CartPayload = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
type CartTransaction = Prisma.TransactionClient;

@Injectable()
export class CartService {
  private readonly maxItemQuantity = 99;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async findMine(userId: string) {
    const cart = await this.findOrCreateActiveCart(userId);

    return this.formatCart(cart);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    await this.ensurePurchasableVariant(dto.variantId);

    await this.prisma.$transaction(
      async (tx) => {
        const cart = await this.findOrCreateActiveCartInTransaction(tx, userId);
        const existingItem = await tx.cartItem.findUnique({
          where: {
            cartId_variantId: {
              cartId: cart.id,
              variantId: dto.variantId,
            },
          },
        });

        const nextQuantity = (existingItem?.quantity ?? 0) + dto.quantity;

        if (nextQuantity > this.maxItemQuantity) {
          throw new BadRequestException(
            `A cart item cannot have more than ${this.maxItemQuantity} units.`,
          );
        }

        const cartItem = existingItem
          ? await tx.cartItem.update({
              where: { id: existingItem.id },
              data: { quantity: nextQuantity },
            })
          : await tx.cartItem.create({
              data: {
                cartId: cart.id,
                variantId: dto.variantId,
                quantity: dto.quantity,
              },
            });

        await this.inventoryService.replaceCartItemReservations(
          tx,
          cartItem.id,
          dto.variantId,
          nextQuantity,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.findMine(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    await this.prisma.$transaction(
      async (tx) => {
        const cartItem = await this.findCartItemForUserInTransaction(tx, userId, itemId);
        await this.ensurePurchasableVariant(cartItem.variantId);

        await tx.cartItem.update({
          where: { id: itemId },
          data: { quantity: dto.quantity },
        });

        await this.inventoryService.replaceCartItemReservations(
          tx,
          itemId,
          cartItem.variantId,
          dto.quantity,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.findMine(userId);
  }

  async removeItem(userId: string, itemId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.findCartItemForUserInTransaction(tx, userId, itemId);
      await this.inventoryService.releaseCartItemReservations(tx, itemId);
      await tx.cartItem.delete({ where: { id: itemId } });
    });

    return this.findMine(userId);
  }

  async clearMine(userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findFirst({
        where: { userId, status: CartStatus.ACTIVE },
        select: {
          id: true,
          items: { select: { id: true } },
        },
      });

      if (!cart) {
        return;
      }

      for (const item of cart.items) {
        await this.inventoryService.releaseCartItemReservations(tx, item.id);
      }

      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
    });

    return this.findMine(userId);
  }

  async applyCoupon(userId: string, dto: ApplyCartCouponDto) {
    const couponCode = dto.couponCode.trim().toUpperCase();

    const cart = await this.findOrCreateActiveCart(userId);

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode },
    });

    return this.findMine(userId);
  }

  async removeCoupon(userId: string) {
    const cart = await this.findOrCreateActiveCart(userId);

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: null },
    });

    return this.findMine(userId);
  }

  private async findOrCreateActiveCart(userId: string): Promise<CartPayload> {
    const existingCart = await this.prisma.cart.findFirst({
      where: { userId, status: CartStatus.ACTIVE },
      include: cartInclude,
    });

    if (existingCart) {
      return existingCart;
    }

    const cart = await this.prisma.cart.create({
      data: {
        userId,
        status: CartStatus.ACTIVE,
      },
      include: cartInclude,
    });

    return cart;
  }

  private async findOrCreateActiveCartInTransaction(tx: CartTransaction, userId: string) {
    const existingCart = await tx.cart.findFirst({
      where: { userId, status: CartStatus.ACTIVE },
      select: { id: true },
    });

    if (existingCart) {
      return existingCart;
    }

    return tx.cart.create({
      data: {
        userId,
        status: CartStatus.ACTIVE,
      },
      select: { id: true },
    });
  }

  private async findCartItemForUserInTransaction(
    tx: CartTransaction,
    userId: string,
    itemId: string,
  ) {
    const cartItem = await tx.cartItem.findFirst({
      where: {
        id: itemId,
        cart: {
          userId,
          status: CartStatus.ACTIVE,
        },
      },
      select: {
        id: true,
        variantId: true,
      },
    });

    if (!cartItem) {
      throw new NotFoundException("Cart item not found.");
    }

    return cartItem;
  }

  private async ensurePurchasableVariant(variantId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        isActive: true,
        product: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!variant || !variant.isActive || variant.product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException("Product variant is not available for purchase.");
    }
  }

  private formatCart(cart: CartPayload) {
    const items = cart.items.map((item) => {
      const unitPriceAmount = Number(item.variant.price);
      const lineTotalAmount = Number((unitPriceAmount * item.quantity).toFixed(2));
      const reservedQuantity = item.reservations.reduce(
        (total, reservation) => total + reservation.quantity,
        0,
      );
      const reservationExpiresAt = item.reservations.reduce<Date | null>(
        (earliest, reservation) =>
          earliest === null || reservation.expiresAt < earliest ? reservation.expiresAt : earliest,
        null,
      );

      return {
        id: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
        addedAt: item.addedAt,
        updatedAt: item.updatedAt,
        reservedQuantity,
        reservationExpiresAt,
        unitPriceAmount,
        lineTotalAmount,
        variant: {
          id: item.variant.id,
          sku: item.variant.sku,
          title: item.variant.title,
          attributes: item.variant.attributes,
          price: item.variant.price,
          compareAtPrice: item.variant.compareAtPrice,
          currency: item.variant.currency,
          weightGrams: item.variant.weightGrams,
          images: item.variant.images,
          product: item.variant.product,
        },
      };
    });

    const subtotalAmount = Number(
      items.reduce((total, item) => total + item.lineTotalAmount, 0).toFixed(2),
    );
    const discountAmount = 0;

    return {
      id: cart.id,
      status: cart.status,
      couponCode: cart.couponCode,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
      items,
      totals: {
        currency: items[0]?.variant.currency ?? "USD",
        subtotalAmount,
        discountAmount,
        totalAmount: Number((subtotalAmount - discountAmount).toFixed(2)),
      },
    };
  }
}
