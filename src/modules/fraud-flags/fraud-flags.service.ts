import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import { FraudFlagStatus } from "../../../generated/prisma/enums";
import { FRAUD_FLAG_TRANSITIONS } from "./fraud-flags.constants";
import { CreateFraudFlagDto } from "./dto/create-fraud-flag.dto";
import { ListFraudFlagsDto } from "./dto/list-fraud-flags.dto";
import { UpdateFraudFlagStatusDto } from "./dto/update-fraud-flag-status.dto";
import { Prisma } from "../../../generated/prisma/client";

@Injectable()
export class FraudFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createdByUserId: string, dto: CreateFraudFlagDto) {
    // Validate referenced entities exist before creating
    if (dto.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException(`User ${dto.userId} not found`);
    }

    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
        select: { id: true },
      });
      if (!order) throw new NotFoundException(`Order ${dto.orderId} not found`);
    }

    return this.prisma.fraudFlag.create({
      data: {
        userId: dto.userId,
        orderId: dto.orderId,
        severity: dto.severity,
        reason: dto.reason,
        metadata: dto.metadata as Prisma.InputJsonValue,
        createdByUserId,
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        order: { select: { id: true, orderNumber: true } },
        createdBy: { select: { id: true, email: true } },
      },
    });
  }

  async findAll(query: ListFraudFlagsDto) {
    const { status, severity, userId, orderId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.FraudFlagWhereInput = {
      ...(status && { status }),
      ...(severity && { severity }),
      ...(userId && { userId }),
      ...(orderId && { orderId }),
    };

    const [items, total] = await Promise.all([
      this.prisma.fraudFlag.findMany({
        where,
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          order: { select: { id: true, orderNumber: true } },
          createdBy: { select: { id: true, email: true } },
          resolvedBy: { select: { id: true, email: true } },
        },
      }),
      this.prisma.fraudFlag.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    const flag = await this.prisma.fraudFlag.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        order: { select: { id: true, orderNumber: true } },
        createdBy: { select: { id: true, email: true } },
        resolvedBy: { select: { id: true, email: true } },
      },
    });

    if (!flag) throw new NotFoundException(`Fraud flag ${id} not found`);
    return flag;
  }

  async updateStatus(id: string, resolvedByUserId: string, dto: UpdateFraudFlagStatusDto) {
    const flag = await this.prisma.fraudFlag.findUnique({ where: { id } });
    if (!flag) throw new NotFoundException(`Fraud flag ${id} not found`);

    // Validate the transition is allowed
    const allowed = FRAUD_FLAG_TRANSITIONS[flag.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition fraud flag from ${flag.status} to ${dto.status}`,
      );
    }

    const isTerminal =
      dto.status === FraudFlagStatus.RESOLVED || dto.status === FraudFlagStatus.DISMISSED;

    return this.prisma.fraudFlag.update({
      where: { id },
      data: {
        status: dto.status,
        resolvedByUserId: isTerminal ? resolvedByUserId : undefined,
        resolvedAt: isTerminal ? new Date() : undefined,
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        order: { select: { id: true, orderNumber: true } },
        createdBy: { select: { id: true, email: true } },
        resolvedBy: { select: { id: true, email: true } },
      },
    });
  }
}
