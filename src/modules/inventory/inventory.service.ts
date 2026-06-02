import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client";
import {
  InventoryReservationStatus,
  ReturnRequestStatus,
  UserRole,
} from "../../../generated/prisma/enums";
import { PrismaService } from "../../database/prisma.service";
import type { AuthenticatedUser } from "../auth/types/auth.types";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { ListInventoryReservationsDto } from "./dto/list-inventory-reservations.dto";
import { UpdateWarehouseDto } from "./dto/update-warehouse.dto";
import { UpsertInventoryItemDto } from "./dto/upsert-inventory-item.dto";

type InventoryTransaction = Prisma.TransactionClient;
type ReturnRequestWithItems = Prisma.ReturnRequestGetPayload<{
  include: {
    items: {
      include: {
        orderItem: true;
      };
    };
  };
}>;

@Injectable()
export class InventoryService {
  private readonly cartReservationTtlMinutes = 30;

  constructor(private readonly prisma: PrismaService) {}

  async createWarehouse(dto: CreateWarehouseDto) {
    const existing = await this.prisma.warehouse.findUnique({
      where: { code: dto.code.trim().toUpperCase() },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(`Warehouse code '${dto.code}' is already in use.`);
    }

    return this.prisma.warehouse.create({
      data: {
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        country: dto.country.trim().toUpperCase(),
        region: this.normalizeOptionalString(dto.region),
        city: dto.city.trim(),
      },
    });
  }

  findWarehouses() {
    return this.prisma.warehouse.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async updateWarehouse(id: string, dto: UpdateWarehouseDto) {
    await this.ensureWarehouseExists(id);

    if (dto.code) {
      const existing = await this.prisma.warehouse.findUnique({
        where: { code: dto.code.trim().toUpperCase() },
        select: { id: true },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(`Warehouse code '${dto.code}' is already in use.`);
      }
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.code !== undefined && { code: dto.code.trim().toUpperCase() }),
        ...(dto.country !== undefined && { country: dto.country.trim().toUpperCase() }),
        ...(dto.region !== undefined && { region: this.normalizeOptionalString(dto.region) }),
        ...(dto.city !== undefined && { city: dto.city.trim() }),
      },
    });
  }

  async getVariantInventory(productId: string, variantId: string, user: AuthenticatedUser) {
    await this.ensureVariantBelongsToProduct(productId, variantId);
    await this.ensureCanAccessVariant(user, variantId);

    const items = await this.prisma.inventoryItem.findMany({
      where: { variantId },
      include: { warehouse: true },
      orderBy: { warehouse: { code: "asc" } },
    });

    const totals = items.reduce(
      (acc, item) => {
        acc.quantity += item.quantity;
        acc.reserved += item.reserved;
        acc.available += item.quantity - item.reserved;
        return acc;
      },
      { quantity: 0, reserved: 0, available: 0 },
    );

    return {
      variantId,
      totals,
      warehouses: items.map((item) => ({
        ...item,
        available: item.quantity - item.reserved,
      })),
    };
  }

  async upsertInventoryItem(
    variantId: string,
    warehouseId: string,
    dto: UpsertInventoryItemDto,
    user: AuthenticatedUser,
  ) {
    await this.ensureCanAccessVariant(user, variantId);
    await this.ensureWarehouseExists(warehouseId);
    await this.ensureVariantExists(variantId);

    const current = await this.prisma.inventoryItem.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
    });

    const nextQuantity = dto.quantity ?? current?.quantity ?? 0;
    const nextReserved = current?.reserved ?? 0;

    if (nextQuantity < nextReserved) {
      throw new BadRequestException(
        `Quantity cannot be lower than currently reserved stock (${nextReserved}).`,
      );
    }

    const item = await this.prisma.inventoryItem.upsert({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      create: {
        variantId,
        warehouseId,
        quantity: nextQuantity,
        reserved: 0,
        reorderPoint: dto.reorderPoint ?? 0,
      },
      update: {
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.reorderPoint !== undefined && { reorderPoint: dto.reorderPoint }),
      },
      include: { warehouse: true, variant: true },
    });

    return {
      ...item,
      available: item.quantity - item.reserved,
    };
  }

  async listReservations(query: ListInventoryReservationsDto) {
    const where: Prisma.InventoryReservationWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.variantId && { variantId: query.variantId }),
    };

    return this.prisma.inventoryReservation.findMany({
      where,
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            title: true,
            productId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async expireReservations() {
    const expiredReservations = await this.prisma.inventoryReservation.findMany({
      where: {
        status: InventoryReservationStatus.ACTIVE,
        expiresAt: { lte: new Date() },
      },
      select: { id: true, variantId: true, warehouseId: true, quantity: true },
    });

    await this.prisma.$transaction(async (tx) => {
      for (const reservation of expiredReservations) {
        if (reservation.warehouseId) {
          await tx.inventoryItem.updateMany({
            where: {
              variantId: reservation.variantId,
              warehouseId: reservation.warehouseId,
              reserved: { gte: reservation.quantity },
            },
            data: {
              reserved: { decrement: reservation.quantity },
            },
          });
        }

        await tx.inventoryReservation.update({
          where: { id: reservation.id },
          data: { status: InventoryReservationStatus.EXPIRED },
        });
      }
    });

    return {
      expired: expiredReservations.length,
    };
  }

  async replaceCartItemReservations(
    tx: InventoryTransaction,
    cartItemId: string,
    variantId: string,
    quantity: number,
  ): Promise<void> {
    await this.releaseCartItemReservations(tx, cartItemId);

    const inventoryItems = await tx.inventoryItem.findMany({
      where: { variantId },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    });

    let remainingQuantity = quantity;
    const expiresAt = new Date(Date.now() + this.cartReservationTtlMinutes * 60 * 1000);

    for (const inventoryItem of inventoryItems) {
      const available = inventoryItem.quantity - inventoryItem.reserved;

      if (available <= 0) {
        continue;
      }

      const reservedQuantity = Math.min(available, remainingQuantity);

      const reservationUpdate = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          quantity: { gte: inventoryItem.reserved + reservedQuantity },
        },
        data: { reserved: { increment: reservedQuantity } },
      });

      if (reservationUpdate.count === 0) {
        throw new ConflictException("Not enough stock is available for this cart item.");
      }

      await tx.inventoryReservation.create({
        data: {
          variantId,
          warehouseId: inventoryItem.warehouseId,
          cartItemId,
          quantity: reservedQuantity,
          status: InventoryReservationStatus.ACTIVE,
          expiresAt,
        },
      });

      remainingQuantity -= reservedQuantity;

      if (remainingQuantity === 0) {
        return;
      }
    }

    throw new ConflictException("Not enough stock is available for this cart item.");
  }

  async releaseCartItemReservations(tx: InventoryTransaction, cartItemId: string): Promise<void> {
    const reservations = await tx.inventoryReservation.findMany({
      where: {
        cartItemId,
        status: InventoryReservationStatus.ACTIVE,
      },
      select: {
        id: true,
        variantId: true,
        warehouseId: true,
        quantity: true,
      },
    });

    for (const reservation of reservations) {
      if (reservation.warehouseId) {
        await tx.inventoryItem.updateMany({
          where: {
            variantId: reservation.variantId,
            warehouseId: reservation.warehouseId,
            reserved: { gte: reservation.quantity },
          },
          data: {
            reserved: { decrement: reservation.quantity },
          },
        });
      }

      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: InventoryReservationStatus.RELEASED },
      });
    }
  }

  async moveCartItemReservationsToOrderItem(
    tx: InventoryTransaction,
    cartItemId: string,
    orderItemId: string,
  ): Promise<void> {
    await tx.inventoryReservation.updateMany({
      where: {
        cartItemId,
        status: InventoryReservationStatus.ACTIVE,
      },
      data: {
        cartItemId: null,
        orderItemId,
      },
    });
  }

  async releaseOrderItemReservations(tx: InventoryTransaction, orderItemId: string): Promise<void> {
    const reservations = await tx.inventoryReservation.findMany({
      where: {
        orderItemId,
        status: InventoryReservationStatus.ACTIVE,
      },
      select: {
        id: true,
        variantId: true,
        warehouseId: true,
        quantity: true,
      },
    });

    for (const reservation of reservations) {
      if (reservation.warehouseId) {
        await tx.inventoryItem.updateMany({
          where: {
            variantId: reservation.variantId,
            warehouseId: reservation.warehouseId,
            reserved: { gte: reservation.quantity },
          },
          data: {
            reserved: { decrement: reservation.quantity },
          },
        });
      }

      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: InventoryReservationStatus.RELEASED },
      });
    }
  }

  async consumeCartItemReservations(tx: InventoryTransaction, cartItemId: string): Promise<void> {
    const reservations = await tx.inventoryReservation.findMany({
      where: {
        cartItemId,
        status: InventoryReservationStatus.ACTIVE,
      },
      select: {
        id: true,
        variantId: true,
        warehouseId: true,
        quantity: true,
      },
    });

    for (const reservation of reservations) {
      if (reservation.warehouseId) {
        const updateResult = await tx.inventoryItem.updateMany({
          where: {
            variantId: reservation.variantId,
            warehouseId: reservation.warehouseId,
            quantity: { gte: reservation.quantity },
            reserved: { gte: reservation.quantity },
          },
          data: {
            quantity: { decrement: reservation.quantity },
            reserved: { decrement: reservation.quantity },
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException("Reserved stock could not be consumed.");
        }
      }

      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: InventoryReservationStatus.CONSUMED },
      });
    }
  }

  async consumeOrderItemReservations(
    tx: InventoryTransaction,
    orderItemId: string,
    expectedQuantity: number,
  ): Promise<void> {
    const reservations = await tx.inventoryReservation.findMany({
      where: {
        orderItemId,
        status: InventoryReservationStatus.ACTIVE,
      },
      select: {
        id: true,
        variantId: true,
        warehouseId: true,
        quantity: true,
      },
    });
    const reservedQuantity = reservations.reduce(
      (total, reservation) => total + reservation.quantity,
      0,
    );

    if (reservedQuantity < expectedQuantity) {
      throw new ConflictException("Reserved stock is no longer available for this order item.");
    }

    for (const reservation of reservations) {
      if (reservation.warehouseId) {
        const updateResult = await tx.inventoryItem.updateMany({
          where: {
            variantId: reservation.variantId,
            warehouseId: reservation.warehouseId,
            quantity: { gte: reservation.quantity },
            reserved: { gte: reservation.quantity },
          },
          data: {
            quantity: { decrement: reservation.quantity },
            reserved: { decrement: reservation.quantity },
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException("Reserved stock could not be consumed.");
        }
      }

      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: InventoryReservationStatus.CONSUMED },
      });
    }
  }

  private async ensureWarehouseExists(id: string): Promise<void> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!warehouse) {
      throw new NotFoundException("Warehouse not found.");
    }
  }

  private async ensureVariantExists(id: string): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!variant) {
      throw new NotFoundException("Variant not found.");
    }
  }

  private async ensureVariantBelongsToProduct(productId: string, variantId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
      select: { id: true },
    });

    if (!variant) {
      throw new NotFoundException("Variant not found on this product.");
    }
  }

  private async ensureCanAccessVariant(user: AuthenticatedUser, variantId: string): Promise<void> {
    if (user.roles.includes(UserRole.ADMIN)) {
      return;
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: {
        product: {
          select: {
            seller: {
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundException("Variant not found.");
    }

    if (variant.product.seller.userId !== user.id) {
      throw new ForbiddenException("You do not own this variant.");
    }
  }

  private normalizeOptionalString(value: string | undefined): string | undefined {
    return value?.trim();
  }

  async restockReturnedItems(returnRequest: ReturnRequestWithItems) {
    await this.prisma.$transaction(async (tx) => {
      for (const item of returnRequest.items) {
        const reservations = await tx.inventoryReservation.findMany({
          where: {
            orderItemId: item.orderItemId,
            status: InventoryReservationStatus.CONSUMED,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            variantId: true,
            warehouseId: true,
            quantity: true,
          },
        });

        if (reservations.length === 0) {
          throw new ConflictException(
            `No consumed inventory reservations found for order item ${item.orderItemId}.`,
          );
        }

        const previouslyRefunded = await tx.returnItem.aggregate({
          where: {
            orderItemId: item.orderItemId,
            returnRequestId: { not: returnRequest.id },
            returnRequest: {
              status: ReturnRequestStatus.REFUNDED,
            },
          },
          _sum: {
            quantity: true,
          },
        });

        const alreadyRestockedQuantity = previouslyRefunded._sum.quantity ?? 0;
        const totalConsumedQuantity = reservations.reduce(
          (total, reservation) => total + reservation.quantity,
          0,
        );
        const remainingConsumableQuantity = Math.max(totalConsumedQuantity - alreadyRestockedQuantity, 0);
        let remainingToRestock = Math.min(item.quantity, remainingConsumableQuantity);

        if (remainingToRestock <= 0) {
          continue;
        }

        // Skip reservation slices already restocked by earlier refunded returns for this order item.
        let remainingToSkip = alreadyRestockedQuantity;

        for (const reservation of reservations) {
          if (remainingToRestock <= 0) {
            break;
          }

          if (!reservation.warehouseId) {
            throw new ConflictException(
              `Consumed reservation ${reservation.id} has no warehouse and cannot be restocked.`,
            );
          }

          if (remainingToSkip >= reservation.quantity) {
            remainingToSkip -= reservation.quantity;
            continue;
          }

          const restockableQuantityFromReservation = reservation.quantity - remainingToSkip;
          remainingToSkip = 0;
          const restockQuantity = Math.min(restockableQuantityFromReservation, remainingToRestock);

          const updatedInventory = await tx.inventoryItem.updateMany({
            where: {
              variantId: reservation.variantId,
              warehouseId: reservation.warehouseId,
            },
            data: {
              quantity: { increment: restockQuantity },
            },
          });

          if (updatedInventory.count === 0) {
            await tx.inventoryItem.create({
              data: {
                variantId: reservation.variantId,
                warehouseId: reservation.warehouseId,
                quantity: restockQuantity,
                reserved: 0,
                reorderPoint: 0,
              },
            });
          }

          remainingToRestock -= restockQuantity;
        }

        if (remainingToRestock > 0) {
          throw new ConflictException(
            `Unable to fully restock returned quantity for order item ${item.orderItemId}.`,
          );
        }
      }
    });
  }
}
