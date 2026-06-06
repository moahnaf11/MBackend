import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OrderStatus } from "../../../generated/prisma/enums";
import { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ListReviewsDto } from "./dto/list-reviews.dto";
import { ModerateReviewDto } from "./dto/moderate-review.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";

const reviewInclude = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
    },
  },
  product: {
    select: {
      id: true,
      title: true,
      slug: true,
    },
  },
} satisfies Prisma.ReviewInclude;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateReviewDto) {
    await this.ensureProductExists(dto.productId);

    const existingReview = await this.prisma.review.findUnique({
      where: {
        productId_userId: {
          productId: dto.productId,
          userId,
        },
      },
      select: { id: true },
    });

    if (existingReview) {
      throw new ConflictException("You have already reviewed this product.");
    }

    const isVerifiedPurchase = await this.hasDeliveredPurchase(userId, dto.productId);

    if (!isVerifiedPurchase) {
      throw new ForbiddenException("You can only review products from delivered orders.");
    }

    return this.prisma.review.create({
      data: {
        productId: dto.productId,
        userId,
        rating: dto.rating,
        title: this.normalizeOptionalString(dto.title),
        body: this.normalizeOptionalString(dto.body),
        isVerifiedPurchase,
      },
      include: reviewInclude,
    });
  }

  findPublicByProduct(productId: string, query: ListReviewsDto) {
    return this.findMany({
      ...query,
      productId,
      isVisible: true,
    });
  }

  async findPublicById(id: string) {
    const review = await this.prisma.review.findFirst({
      where: { id, isVisible: true },
      include: reviewInclude,
    });

    if (!review) {
      throw new NotFoundException("Review not found.");
    }

    return review;
  }

  findMine(userId: string, query: ListReviewsDto) {
    const safeQuery = { ...query };
    delete safeQuery.userId;

    return this.findMany({
      ...safeQuery,
      userId,
    });
  }

  async updateMine(userId: string, id: string, dto: UpdateReviewDto) {
    await this.findOwnedReviewOrThrow(userId, id);

    if (
      dto.rating === undefined &&
      dto.title === undefined &&
      dto.body === undefined
    ) {
      throw new BadRequestException("At least one review field must be provided.");
    }

    return this.prisma.review.update({
      where: { id },
      data: {
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.title !== undefined && { title: this.normalizeOptionalString(dto.title) }),
        ...(dto.body !== undefined && { body: this.normalizeOptionalString(dto.body) }),
      },
      include: reviewInclude,
    });
  }

  async removeMine(userId: string, id: string): Promise<void> {
    await this.findOwnedReviewOrThrow(userId, id);
    await this.prisma.review.delete({ where: { id } });
  }

  findAll(query: ListReviewsDto) {
    return this.findMany(query);
  }

  async moderate(id: string, dto: ModerateReviewDto) {
    await this.ensureReviewExists(id);

    return this.prisma.review.update({
      where: { id },
      data: { isVisible: dto.isVisible },
      include: reviewInclude,
    });
  }

  async remove(id: string): Promise<void> {
    await this.ensureReviewExists(id);
    await this.prisma.review.delete({ where: { id } });
  }

  private async findMany(query: ListReviewsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ReviewWhereInput = {
      ...(query.productId && { productId: query.productId }),
      ...(query.userId && { userId: query.userId }),
      ...(query.isVisible !== undefined && { isVisible: query.isVisible }),
      ...(query.isVerifiedPurchase !== undefined && {
        isVerifiedPurchase: query.isVerifiedPurchase,
      }),
    };

    const [items, total, ratingSummary] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: reviewInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({
        where,
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        averageRating: ratingSummary._avg.rating,
        ratingCount: ratingSummary._count.rating,
      },
    };
  }

  private async hasDeliveredPurchase(userId: string, productId: string): Promise<boolean> {
    const orderItem = await this.prisma.orderItem.findFirst({
      where: {
        variant: { productId },
        order: {
          userId,
          status: OrderStatus.DELIVERED,
        },
      },
      select: { id: true },
    });

    return orderItem !== null;
  }

  private async ensureProductExists(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException("Product not found.");
    }
  }

  private async ensureReviewExists(id: string): Promise<void> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!review) {
      throw new NotFoundException("Review not found.");
    }
  }

  private async findOwnedReviewOrThrow(userId: string, id: string): Promise<void> {
    const review = await this.prisma.review.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!review) {
      throw new NotFoundException("Review not found.");
    }
  }

  private normalizeOptionalString(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized === "" ? undefined : normalized;
  }
}
