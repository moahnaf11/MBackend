import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CouponStatus,
  PromotionStatus,
  PromotionType,
  SellerStatus,
  UserRole,
} from "../../../generated/prisma/enums";
import { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { AuthenticatedUser } from "../auth/types/auth.types";
import { CreateCouponDto } from "./dto/create-coupon.dto";
import { CreatePromotionDto } from "./dto/create-promotion.dto";
import { ListPromotionsDto } from "./dto/list-promotions.dto";
import { UpdateCouponDto } from "./dto/update-coupon.dto";
import { UpdatePromotionDto } from "./dto/update-promotion.dto";
import { UpdatePromotionStatusDto } from "./dto/update-promotion-status.dto";

const promotionInclude = {
  seller: {
    select: {
      id: true,
      storeName: true,
      slug: true,
    },
  },
  coupons: true,
  products: { include: { product: { select: { id: true, title: true, slug: true } } } },
  variants: { include: { variant: { select: { id: true, sku: true, title: true } } } },
  categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.PromotionInclude;

type PromotionTransaction = Prisma.TransactionClient;
type CartPromotionItem = {
  quantity: number;
  variantId: string;
  variant: {
    price: Prisma.Decimal;
    currency: string;
    product: {
      id: string;
      sellerId: string;
      categories: { categoryId: string }[];
    };
  };
};

type CartForPromotion = {
  id: string;
  couponCode: string | null;
  items: CartPromotionItem[];
};

export type CartDiscountResult = {
  promotionId: string | null;
  couponId: string | null;
  discountAmount: Prisma.Decimal;
  currency: string;
};

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreatePromotionDto) {
    const sellerId = await this.resolveSellerIdForMutation(user, dto.sellerId);
    this.validatePromotionConfiguration(dto);

    const promotion = await this.prisma.$transaction(async (tx) => {
      const created = await tx.promotion.create({
        data: {
          sellerId,
          name: dto.name.trim(),
          description: this.normalizeOptionalString(dto.description),
          type: dto.type,
          discountPercent:
            dto.discountPercent !== undefined ? new Prisma.Decimal(dto.discountPercent) : undefined,
          discountAmount:
            dto.discountAmount !== undefined ? new Prisma.Decimal(dto.discountAmount) : undefined,
          currency: (dto.currency ?? "USD").toUpperCase(),
          buyQuantity: dto.buyQuantity,
          getQuantity: dto.getQuantity,
          maxDiscountAmount:
            dto.maxDiscountAmount !== undefined
              ? new Prisma.Decimal(dto.maxDiscountAmount)
              : undefined,
          minOrderAmount:
            dto.minOrderAmount !== undefined ? new Prisma.Decimal(dto.minOrderAmount) : undefined,
          startsAt: new Date(dto.startsAt),
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          usageLimit: dto.usageLimit,
          usageLimitPerUser: dto.usageLimitPerUser,
        },
        select: { id: true },
      });

      await this.replacePromotionTargets(tx, created.id, dto);

      return created;
    });

    return this.findByIdForUser(user, promotion.id);
  }

  async findAll(user: AuthenticatedUser, query: ListPromotionsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PromotionWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.type && { type: query.type }),
      ...(query.sellerId && { sellerId: query.sellerId }),
    };

    if (!this.isAdminOrSupport(user)) {
      where.sellerId = await this.resolveSellerProfileId(user.id);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.promotion.findMany({
        where,
        include: promotionInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.promotion.count({ where }),
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

  async findByIdForUser(user: AuthenticatedUser, id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      include: promotionInclude,
    });

    if (!promotion) {
      throw new NotFoundException("Promotion not found.");
    }

    await this.ensureCanManagePromotion(user, promotion.sellerId);

    return promotion;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdatePromotionDto) {
    const current = await this.prisma.promotion.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        type: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!current) {
      throw new NotFoundException("Promotion not found.");
    }

    await this.ensureCanManagePromotion(user, current.sellerId);
    this.validatePromotionConfiguration({
      ...dto,
      type: dto.type ?? current.type,
      startsAt: dto.startsAt ?? current.startsAt.toISOString(),
      endsAt: dto.endsAt ?? current.endsAt?.toISOString(),
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.promotion.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.description !== undefined && {
            description: this.normalizeOptionalString(dto.description),
          }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.discountPercent !== undefined && {
            discountPercent: new Prisma.Decimal(dto.discountPercent),
          }),
          ...(dto.discountAmount !== undefined && {
            discountAmount: new Prisma.Decimal(dto.discountAmount),
          }),
          ...(dto.currency !== undefined && { currency: dto.currency.toUpperCase() }),
          ...(dto.buyQuantity !== undefined && { buyQuantity: dto.buyQuantity }),
          ...(dto.getQuantity !== undefined && { getQuantity: dto.getQuantity }),
          ...(dto.maxDiscountAmount !== undefined && {
            maxDiscountAmount: new Prisma.Decimal(dto.maxDiscountAmount),
          }),
          ...(dto.minOrderAmount !== undefined && {
            minOrderAmount: new Prisma.Decimal(dto.minOrderAmount),
          }),
          ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
          ...(dto.endsAt !== undefined && { endsAt: new Date(dto.endsAt) }),
          ...(dto.usageLimit !== undefined && { usageLimit: dto.usageLimit }),
          ...(dto.usageLimitPerUser !== undefined && { usageLimitPerUser: dto.usageLimitPerUser }),
        },
      });

      await this.replacePromotionTargets(tx, id, dto);
    });

    return this.findByIdForUser(user, id);
  }

  async updateStatus(user: AuthenticatedUser, id: string, dto: UpdatePromotionStatusDto) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      select: { sellerId: true },
    });

    if (!promotion) {
      throw new NotFoundException("Promotion not found.");
    }

    await this.ensureCanManagePromotion(user, promotion.sellerId);

    return this.prisma.promotion.update({
      where: { id },
      data: { status: dto.status },
      include: promotionInclude,
    });
  }

  async createCoupon(user: AuthenticatedUser, promotionId: string, dto: CreateCouponDto) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true, sellerId: true },
    });

    if (!promotion) {
      throw new NotFoundException("Promotion not found.");
    }

    await this.ensureCanManagePromotion(user, promotion.sellerId);
    const code = this.normalizeCouponCode(dto.code);
    const existing = await this.prisma.coupon.findUnique({ where: { code }, select: { id: true } });

    if (existing) {
      throw new ConflictException("Coupon code is already in use.");
    }

    return this.prisma.coupon.create({
      data: {
        promotionId,
        code,
        usageLimit: dto.usageLimit,
        usageLimitPerUser: dto.usageLimitPerUser,
      },
      include: { promotion: true },
    });
  }

  async listCoupons(user: AuthenticatedUser, promotionId: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
      select: { sellerId: true },
    });

    if (!promotion) {
      throw new NotFoundException("Promotion not found.");
    }

    await this.ensureCanManagePromotion(user, promotion.sellerId);

    return this.prisma.coupon.findMany({
      where: { promotionId },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateCoupon(user: AuthenticatedUser, id: string, dto: UpdateCouponDto) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: { promotion: { select: { sellerId: true } } },
    });

    if (!coupon) {
      throw new NotFoundException("Coupon not found.");
    }

    await this.ensureCanManagePromotion(user, coupon.promotion.sellerId);

    return this.prisma.coupon.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.usageLimit !== undefined && { usageLimit: dto.usageLimit }),
        ...(dto.usageLimitPerUser !== undefined && { usageLimitPerUser: dto.usageLimitPerUser }),
      },
      include: { promotion: true },
    });
  }

  async validateCouponForCart(userId: string, cartId: string, couponCode: string) {
    const cart = await this.prisma.cart.findFirst({
      where: { id: cartId, userId },
      include: this.getCartDiscountInclude(),
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException("Your cart is empty.");
    }

    return this.calculateCartDiscount(this.prisma, {
      userId,
      cart: { ...cart, couponCode: this.normalizeCouponCode(couponCode) },
      shippingAmount: new Prisma.Decimal(0),
    });
  }

  async calculateCartDiscount(
    tx: PromotionTransaction | PrismaService,
    input: {
      userId: string;
      cart: CartForPromotion;
      shippingAmount: Prisma.Decimal;
    },
  ): Promise<CartDiscountResult> {
    const currency = input.cart.items[0]?.variant.currency ?? "USD";

    if (!input.cart.couponCode) {
      return {
        promotionId: null,
        couponId: null,
        discountAmount: new Prisma.Decimal(0),
        currency,
      };
    }

    const coupon = await tx.coupon.findUnique({
      where: { code: this.normalizeCouponCode(input.cart.couponCode) },
      include: {
        promotion: {
          include: {
            products: true,
            variants: true,
            categories: true,
          },
        },
      },
    });

    if (!coupon || coupon.status !== CouponStatus.ACTIVE) {
      throw new BadRequestException("Coupon code is invalid.");
    }

    const promotion = coupon.promotion;
    this.ensurePromotionCanBeRedeemed(promotion);
    await this.ensureUsageLimits(tx, input.userId, promotion, coupon);

    const subtotalAmount = this.getSubtotal(input.cart.items);

    if (!promotion.currency || promotion.currency !== currency) {
      throw new BadRequestException("Coupon currency does not match this cart.");
    }

    if (promotion.minOrderAmount && subtotalAmount.lessThan(promotion.minOrderAmount)) {
      throw new BadRequestException("Cart does not meet the coupon minimum order amount.");
    }

    const eligibleItems = this.getEligibleCartItems(input.cart.items, promotion);

    if (eligibleItems.length === 0) {
      throw new BadRequestException("Coupon does not apply to the items in this cart.");
    }

    const discountAmount = this.calculateDiscountAmount(
      promotion,
      eligibleItems,
      input.shippingAmount,
    );

    if (discountAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException("Coupon does not apply to this cart.");
    }

    return {
      promotionId: promotion.id,
      couponId: coupon.id,
      discountAmount,
      currency,
    };
  }

  createOrderRedemption(
    tx: PromotionTransaction,
    input: {
      discount: CartDiscountResult;
      userId: string;
      cartId: string;
      orderId: string;
    },
  ) {
    if (!input.discount.promotionId || input.discount.discountAmount.lessThanOrEqualTo(0)) {
      return null;
    }

    return tx.promotionRedemption.create({
      data: {
        promotionId: input.discount.promotionId,
        couponId: input.discount.couponId,
        userId: input.userId,
        cartId: input.cartId,
        orderId: input.orderId,
        discountAmount: input.discount.discountAmount,
        currency: input.discount.currency,
      },
    });
  }

  getCartDiscountInclude() {
    return {
      items: {
        include: {
          variant: {
            include: {
              product: {
                select: {
                  id: true,
                  sellerId: true,
                  categories: { select: { categoryId: true } },
                },
              },
            },
          },
        },
      },
    } satisfies Prisma.CartInclude;
  }

  private async replacePromotionTargets(
    tx: PromotionTransaction,
    promotionId: string,
    dto: Partial<CreatePromotionDto>,
  ): Promise<void> {
    if (dto.productIds !== undefined) {
      await tx.promotionProduct.deleteMany({ where: { promotionId } });
      await tx.promotionProduct.createMany({
        data: dto.productIds.map((productId) => ({ promotionId, productId })),
        skipDuplicates: true,
      });
    }

    if (dto.variantIds !== undefined) {
      await tx.promotionVariant.deleteMany({ where: { promotionId } });
      await tx.promotionVariant.createMany({
        data: dto.variantIds.map((variantId) => ({ promotionId, variantId })),
        skipDuplicates: true,
      });
    }

    if (dto.categoryIds !== undefined) {
      await tx.promotionCategory.deleteMany({ where: { promotionId } });
      await tx.promotionCategory.createMany({
        data: dto.categoryIds.map((categoryId) => ({ promotionId, categoryId })),
        skipDuplicates: true,
      });
    }
  }

  private validatePromotionConfiguration(
    dto: Partial<CreatePromotionDto> & { type: PromotionType },
  ) {
    if (dto.endsAt && dto.startsAt && new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException("Promotion end time must be after start time.");
    }

    if (dto.type === PromotionType.PERCENTAGE_OFF && (dto.discountPercent == null || dto.discountPercent <= 0)) {
      throw new BadRequestException("Percentage promotions require a discountPercent greater than 0.");
    }
    
    if (dto.type === PromotionType.FIXED_AMOUNT_OFF && (dto.discountAmount == null || dto.discountAmount <= 0)) {
      throw new BadRequestException("Fixed amount promotions require a discountAmount greater than 0.");
    }

    if (dto.type === PromotionType.BUY_X_GET_Y && (!dto.buyQuantity || !dto.getQuantity)) {
      throw new BadRequestException("Buy X get Y promotions require buyQuantity and getQuantity.");
    }
  }

  private ensurePromotionCanBeRedeemed(promotion: {
    status: PromotionStatus;
    startsAt: Date;
    endsAt: Date | null;
  }): void {
    const now = new Date();

    if (promotion.status !== PromotionStatus.ACTIVE) {
      throw new BadRequestException("Coupon is not active.");
    }

    if (promotion.startsAt > now || (promotion.endsAt && promotion.endsAt < now)) {
      throw new BadRequestException("Coupon is not currently available.");
    }
  }

  private async ensureUsageLimits(
    tx: PromotionTransaction | PrismaService,
    userId: string,
    promotion: {
      id: string;
      usageLimit: number | null;
      usageLimitPerUser: number | null;
    },
    coupon: {
      id: string;
      usageLimit: number | null;
      usageLimitPerUser: number | null;
    },
  ): Promise<void> {
    if (promotion.usageLimit !== null) {
      const promotionUseCount = await tx.promotionRedemption.count({
        where: { promotionId: promotion.id },
      });

      if (promotionUseCount >= promotion.usageLimit) {
        throw new BadRequestException("Promotion usage limit has been reached.");
      }
    }

    if (coupon.usageLimit !== null) {
      const couponUseCount = await tx.promotionRedemption.count({
        where: { couponId: coupon.id },
      });

      if (couponUseCount >= coupon.usageLimit) {
        throw new BadRequestException("Coupon usage limit has been reached.");
      }
    }

    const perUserLimit = coupon.usageLimitPerUser ?? promotion.usageLimitPerUser;

    if (perUserLimit !== null) {
      const userUseCount = await tx.promotionRedemption.count({
        where: {
          userId,
          OR: [{ couponId: coupon.id }, { promotionId: promotion.id }],
        },
      });

      if (userUseCount >= perUserLimit) {
        throw new BadRequestException("You have already used this coupon.");
      }
    }
  }

  private getEligibleCartItems(
    items: CartPromotionItem[],
    promotion: {
      sellerId: string | null;
      products: { productId: string }[];
      variants: { variantId: string }[];
      categories: { categoryId: string }[];
    },
  ): CartPromotionItem[] {
    const productIds = new Set(promotion.products.map((target) => target.productId));
    const variantIds = new Set(promotion.variants.map((target) => target.variantId));
    const categoryIds = new Set(promotion.categories.map((target) => target.categoryId));
    const hasTargets = productIds.size > 0 || variantIds.size > 0 || categoryIds.size > 0;

    return items.filter((item) => {
      if (promotion.sellerId && item.variant.product.sellerId !== promotion.sellerId) {
        return false;
      }

      if (!hasTargets) {
        return true;
      }

      return (
        variantIds.has(item.variantId) ||
        productIds.has(item.variant.product.id) ||
        item.variant.product.categories.some((category) => categoryIds.has(category.categoryId))
      );
    });
  }

  private calculateDiscountAmount(
    promotion: {
      type: PromotionType;
      discountPercent: Prisma.Decimal | null;
      discountAmount: Prisma.Decimal | null;
      maxDiscountAmount: Prisma.Decimal | null;
      buyQuantity: number | null;
      getQuantity: number | null;
    },
    eligibleItems: CartPromotionItem[],
    shippingAmount: Prisma.Decimal,
  ): Prisma.Decimal {
    const eligibleSubtotal = this.getSubtotal(eligibleItems);
    let discountAmount = new Prisma.Decimal(0);

    if (promotion.type === PromotionType.PERCENTAGE_OFF && promotion.discountPercent) {
      discountAmount = eligibleSubtotal.mul(promotion.discountPercent).div(100);
    }

    if (promotion.type === PromotionType.FIXED_AMOUNT_OFF && promotion.discountAmount) {
      discountAmount = Prisma.Decimal.min(promotion.discountAmount, eligibleSubtotal);
    }

    if (promotion.type === PromotionType.FREE_SHIPPING) {
      discountAmount = shippingAmount;
    }

    if (
      promotion.type === PromotionType.BUY_X_GET_Y &&
      promotion.buyQuantity &&
      promotion.getQuantity
    ) {
      discountAmount = this.calculateBuyXGetYDiscount(
        eligibleItems,
        promotion.buyQuantity,
        promotion.getQuantity,
      );
    }

    if (promotion.maxDiscountAmount) {
      discountAmount = Prisma.Decimal.min(discountAmount, promotion.maxDiscountAmount);
    }

    return Prisma.Decimal.min(discountAmount, eligibleSubtotal).toDecimalPlaces(2);
  }

  private calculateBuyXGetYDiscount(
    eligibleItems: CartPromotionItem[],
    buyQuantity: number,
    getQuantity: number,
  ): Prisma.Decimal {
    const unitPrices = eligibleItems.flatMap((item) =>
      Array.from({ length: item.quantity }, () => new Prisma.Decimal(item.variant.price)),
    );
    const groupSize = buyQuantity + getQuantity;
    const freeItemCount = Math.floor(unitPrices.length / groupSize) * getQuantity;

    if (freeItemCount <= 0) {
      return new Prisma.Decimal(0);
    }

    return unitPrices
      .sort((a, b) => a.comparedTo(b))
      .slice(0, freeItemCount)
      .reduce((total, price) => total.plus(price), new Prisma.Decimal(0));
  }

  private getSubtotal(items: CartPromotionItem[]): Prisma.Decimal {
    return items.reduce(
      (total, item) => total.plus(new Prisma.Decimal(item.variant.price).mul(item.quantity)),
      new Prisma.Decimal(0),
    );
  }

  private async resolveSellerIdForMutation(
    user: AuthenticatedUser,
    requestedSellerId?: string,
  ): Promise<string | null> {
    if (user.roles.includes(UserRole.ADMIN)) {
      return requestedSellerId ?? null;
    }

    return this.resolveSellerProfileId(user.id);
  }

  private async resolveSellerProfileId(userId: string): Promise<string> {
    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });

    if (!sellerProfile) {
      throw new ForbiddenException("No seller profile found for this account.");
    }

    if (sellerProfile.status !== SellerStatus.ACTIVE) {
      throw new ForbiddenException("Seller profile must be active to manage promotions.");
    }

    return sellerProfile.id;
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      select: { sellerId: true, status: true },
    });

    if (!promotion) {
      throw new NotFoundException("Promotion not found.");
    }

    await this.ensureCanManagePromotion(user, promotion.sellerId);

    // Sellers can only delete DRAFT promotions — prevents deleting
    // active promotions that customers may be relying on.
    if (!this.isAdminOrSupport(user) && promotion.status !== PromotionStatus.DRAFT) {
      throw new ConflictException(
        "Only DRAFT promotions can be deleted. Archive the promotion instead.",
      );
    }

    // Block deletion if any redemptions exist — financial audit trail.
    const redemptionCount = await this.prisma.promotionRedemption.count({
      where: { promotionId: id },
    });

    if (redemptionCount > 0) {
      throw new ConflictException(
        "Promotion has been redeemed and cannot be permanently deleted. Archive it instead.",
      );
    }

    await this.prisma.promotion.delete({ where: { id } });
  }

  async removeCoupon(
    user: AuthenticatedUser,
    promotionId: string,
    couponId: string,
  ): Promise<void> {
    const coupon = await this.prisma.coupon.findFirst({
      where: { id: couponId, promotionId },
      include: { promotion: { select: { sellerId: true } } },
    });

    if (!coupon) {
      throw new NotFoundException("Coupon not found on this promotion.");
    }

    await this.ensureCanManagePromotion(user, coupon.promotion.sellerId);

    // Block deletion if the coupon has been redeemed.
    const redemptionCount = await this.prisma.promotionRedemption.count({
      where: { couponId },
    });

    if (redemptionCount > 0) {
      throw new ConflictException(
        "Coupon has been redeemed and cannot be deleted. Disable it via PATCH instead.",
      );
    }

    await this.prisma.coupon.delete({ where: { id: couponId } });
  }

  private async ensureCanManagePromotion(
    user: AuthenticatedUser,
    sellerId: string | null,
  ): Promise<void> {
    if (this.isAdminOrSupport(user)) {
      return;
    }

    const currentSellerId = await this.resolveSellerProfileId(user.id);

    if (currentSellerId !== sellerId) {
      throw new ForbiddenException("You do not own this promotion.");
    }
  }

  private isAdminOrSupport(user: AuthenticatedUser): boolean {
    return user.roles.includes(UserRole.ADMIN) || user.roles.includes(UserRole.SUPPORT);
  }

  private normalizeCouponCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private normalizeOptionalString(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized === "" ? undefined : normalized;
  }
}
