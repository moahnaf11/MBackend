import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { Prisma, TaxRuleStatus } from "../../../generated/prisma/client";
import { ListTaxRulesDto } from "./dto/list-tax-rules.dto";
import { UpdateTaxRuleDto } from "./dto/update-tax-rule.dto";
import { CreateTaxRuleDto } from "./dto/create-tax-rule.dto";

// ─── Types used by the calculator ─────────────────────────────────────────────

export type TaxableOrderItem = {
  orderItemId: string;
  variantId: string;
  totalAmount: Prisma.Decimal;
  product: {
    brandId: string | null;
    categories: { categoryId: string }[];
  };
};

export type ItemTaxResult = {
  orderItemId: string;
  taxAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxRuleId: string | null; // null if no rule matched
};

export type OrderTaxResult = {
  items: ItemTaxResult[];
  totalTaxAmount: Prisma.Decimal;
};

@Injectable()
export class TaxRulesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── ADMIN CRUD ─────────────────────────────────────────────────────────────

  async create(dto: CreateTaxRuleDto) {
    await this.validateForeignKeys(dto.categoryId, dto.brandId);
    this.validateDateRange(dto.startsAt, dto.endsAt);

    return this.prisma.taxRule.create({
      data: {
        name: dto.name.trim(),
        country: dto.country.toUpperCase(),
        region: dto.region?.toUpperCase(),
        categoryId: dto.categoryId ?? null,
        brandId: dto.brandId ?? null,
        rate: new Prisma.Decimal(dto.rate),
        priority: dto.priority ?? 100,
        status: dto.status ?? TaxRuleStatus.ACTIVE,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(query: ListTaxRulesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.TaxRuleWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.country && { country: query.country.toUpperCase() }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.brandId && { brandId: query.brandId }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.taxRule.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.taxRule.count({ where }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const rule = await this.prisma.taxRule.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });

    if (!rule) throw new NotFoundException(`Tax rule ${id} not found.`);
    return rule;
  }

  async update(id: string, dto: UpdateTaxRuleDto) {
    await this.findById(id); // throws 404 if not found

    if (dto.categoryId || dto.brandId) {
      await this.validateForeignKeys(dto.categoryId, dto.brandId);
    }

    if (dto.startsAt || dto.endsAt) {
      this.validateDateRange(dto.startsAt, dto.endsAt);
    }

    return this.prisma.taxRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.country !== undefined && { country: dto.country.toUpperCase() }),
        ...(dto.region !== undefined && { region: dto.region?.toUpperCase() ?? null }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId ?? null }),
        ...(dto.brandId !== undefined && { brandId: dto.brandId ?? null }),
        ...(dto.rate !== undefined && { rate: new Prisma.Decimal(dto.rate) }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
        ...(dto.endsAt !== undefined && { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }),
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.taxRule.delete({ where: { id } });
  }

  // ─── TAX CALCULATOR ─────────────────────────────────────────────────────────

  /**
   * Calculates tax for each item in an order.
   *
   * Algorithm per item:
   *   1. Fetch all ACTIVE rules matching the order's country + region
   *   2. Filter to rules that match the item's brand or category (or have no target)
   *   3. Sort by priority ascending — lowest number wins
   *   4. Apply the first matching rule's rate
   *   5. If no rule matches → taxAmount = 0
   *
   * Called from OrdersService.createFromCart inside the checkout transaction.
   * Accepts a Prisma.TransactionClient so it participates in the same transaction.
   */
  async calculateOrderTax(
    tx: Prisma.TransactionClient,
    country: string,
    region: string | null,
    items: TaxableOrderItem[],
  ): Promise<OrderTaxResult> {
    const now = new Date();

    const candidateRules = await tx.taxRule.findMany({
      where: {
        status: TaxRuleStatus.ACTIVE,
        country: country.toUpperCase(),
        AND: [
          // Date range check
          {
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gte: now } }],
          },
          // Region check
          region ? { OR: [{ region: null }, { region: region.toUpperCase() }] } : { region: null },
        ],
      },
      orderBy: { priority: "asc" },
    });

    const itemResults: ItemTaxResult[] = [];

    for (const item of items) {
      const categoryIds = new Set(item.product.categories.map((c) => c.categoryId));
      const brandId = item.product.brandId;

      // Find the first (highest priority) rule that matches this item.
      // A rule matches if:
      //   - It has no categoryId AND no brandId (applies to everything)
      //   - OR its categoryId matches one of the item's categories
      //   - OR its brandId matches the item's brand
      const matchingRule = candidateRules.find((rule) => {
        const hasTargets = rule.categoryId !== null || rule.brandId !== null;

        if (!hasTargets) {
          // General country/region rule — matches all items
          return true;
        }

        if (rule.categoryId && categoryIds.has(rule.categoryId)) {
          return true;
        }

        if (rule.brandId && brandId && rule.brandId === brandId) {
          return true;
        }

        return false;
      });

      const taxRate = matchingRule ? new Prisma.Decimal(matchingRule.rate) : new Prisma.Decimal(0);
      const taxAmount = item.totalAmount.mul(taxRate).toDecimalPlaces(2);

      itemResults.push({
        orderItemId: item.orderItemId,
        taxAmount,
        taxRate,
        taxRuleId: matchingRule?.id ?? null,
      });
    }

    const totalTaxAmount = itemResults.reduce(
      (sum, r) => sum.plus(r.taxAmount),
      new Prisma.Decimal(0),
    );

    return { items: itemResults, totalTaxAmount };
  }

  // ─── PRIVATE VALIDATORS ──────────────────────────────────────────────────────

  private async validateForeignKeys(categoryId?: string, brandId?: string): Promise<void> {
    if (categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });
      if (!category) throw new NotFoundException(`Category ${categoryId} not found.`);
    }

    if (brandId) {
      const brand = await this.prisma.brand.findUnique({
        where: { id: brandId },
        select: { id: true },
      });
      if (!brand) throw new NotFoundException(`Brand ${brandId} not found.`);
    }
  }

  private validateDateRange(startsAt?: string, endsAt?: string): void {
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      throw new BadRequestException("endsAt must be after startsAt.");
    }
  }
}
