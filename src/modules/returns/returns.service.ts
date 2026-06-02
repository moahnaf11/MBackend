import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { OrdersService } from "../orders/orders.service";
import { ShipmentsService } from "../shipments/shipments.service";
import { CreateReturnRequestDto } from "./dto/create-return-request.dto";
import { OrderStatus, ReturnRequestStatus } from "../../../generated/prisma/enums";
import { UpdateReturnStatusDto } from "./dto/update-return-request.dto";
import { PaymentsService } from "../payments/payments.service";
import { InventoryService } from "../inventory/inventory.service";

@Injectable()
export class ReturnsService {
  private readonly RETURN_STATUS_TRANSITIONS: Record<ReturnRequestStatus, ReturnRequestStatus[]> = {
    REQUESTED: [
      ReturnRequestStatus.APPROVED,
      ReturnRequestStatus.REJECTED,
      ReturnRequestStatus.CANCELLED,
    ],
    APPROVED: [ReturnRequestStatus.IN_TRANSIT, ReturnRequestStatus.CANCELLED],
    REJECTED: [],
    IN_TRANSIT: [ReturnRequestStatus.RECEIVED],
    RECEIVED: [ReturnRequestStatus.REFUNDED, ReturnRequestStatus.CANCELLED],
    REFUNDED: [],
    CANCELLED: [],
  };
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly shipmentsService: ShipmentsService,
    private readonly paymentsService: PaymentsService,
    private readonly inventoryService: InventoryService,
  ) {}

  // ─────────────────────────────────────────────
  // CREATE RETURN REQUEST (CUSTOMER)
  // ─────────────────────────────────────────────
  async createReturn(userId: string, orderId: string, dto: CreateReturnRequestDto) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException("Order not found.");
    }

    // Optional but recommended
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException("Only delivered orders can be returned.");
    }

    // Check each return item
    for (const item of dto.items) {
      const orderItem = order.items.find((i) => i.id === item.orderItemId);

      if (!orderItem) {
        throw new BadRequestException("Invalid order item in return request.");
      }

      if (item.quantity > orderItem.quantity) {
        throw new BadRequestException(
          `Cannot return more than purchased quantity for item ${item.orderItemId}`,
        );
      }
    }

    // Prevent duplicate returns for same order items (basic version)
    const existing = await this.prisma.returnItem.findMany({
      where: {
        orderItemId: { in: dto.items.map((i) => i.orderItemId) },
        returnRequest: {
          status: {
            in: [
              ReturnRequestStatus.REQUESTED,
              ReturnRequestStatus.APPROVED,
              ReturnRequestStatus.IN_TRANSIT,
            ],
          },
        },
      },
    });

    if (existing.length > 0) {
      throw new BadRequestException("Some items already have active return requests.");
    }

    const returnRequest = await this.prisma.returnRequest.create({
      data: {
        orderId,
        requestedById: userId,
        reason: dto.reason,
        items: {
          create: dto.items.map((i) => ({
            orderItemId: i.orderItemId,
            quantity: i.quantity,
            conditionNote: i.conditionNote,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return returnRequest;
  }

  // ─────────────────────────────────────────────
  // GET MY RETURNS
  // ─────────────────────────────────────────────
  async findMine(userId: string) {
    return this.prisma.returnRequest.findMany({
      where: { requestedById: userId },
      include: {
        items: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
  async findMyReturns(userId: string) {
    return this.findMine(userId);
  }

  // ─────────────────────────────────────────────
  // GET SINGLE RETURN
  // ─────────────────────────────────────────────
  async findMineById(userId: string, id: string) {
    const request = await this.prisma.returnRequest.findFirst({
      where: {
        id,
        requestedById: userId,
      },
      include: {
        items: true,
        order: true,
      },
    });

    if (!request) {
      throw new NotFoundException("Return request not found.");
    }

    return request;
  }
  async findMyReturn(userId: string, id: string) {
    return this.findMineById(userId, id);
  }

  async findAll() {
    return this.prisma.returnRequest.findMany({
      include: {
        items: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
        requestedBy: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: {
        items: true,
        order: true,
        requestedBy: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException("Return request not found.");
    }

    return request;
  }

  // ─────────────────────────────────────────────
  // UPDATE STATUS (ADMIN / SELLER)
  // ─────────────────────────────────────────────
  async updateStatus(id: string, dto: UpdateReturnStatusDto) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException("Return request not found.");
    }

    const validNext = this.RETURN_STATUS_TRANSITIONS[request.status];

    if (!validNext.includes(dto.status)) {
      throw new BadRequestException(`Invalid transition from ${request.status} to ${dto.status}`);
    }

    if (dto.status === ReturnRequestStatus.REFUNDED) {
      return this.markAsRefunded(id, dto.resolutionNote);
    }

    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNote: dto.resolutionNote,
        ...(dto.status === ReturnRequestStatus.APPROVED && {
          approvedAt: new Date(),
        }),
        ...(dto.status === ReturnRequestStatus.RECEIVED && {
          receivedAt: new Date(),
        }),
      },
    });

    return updated;
  }

  private async markAsRefunded(id: string, resolutionNote?: string) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: {
        items: {
          include: { orderItem: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException("Return request not found.");
    }

    if (
      request.status !== ReturnRequestStatus.APPROVED &&
      request.status !== ReturnRequestStatus.RECEIVED
    ) {
      throw new BadRequestException(`Invalid transition from ${request.status} to REFUNDED`);
    }

    // External side effect first; provider/idempotency guards prevent duplicate charges.
    await this.paymentsService.processReturnRefund(id);

    await this.inventoryService.restockReturnedItems(request);

    await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: ReturnRequestStatus.REFUNDED,
        resolutionNote,
        closedAt: new Date(),
      },
    });

    const updated = await this.prisma.returnRequest.findUnique({
      where: { id },
    });

    if (!updated) {
      throw new NotFoundException("Return request not found.");
    }

    return updated;
  }
}
