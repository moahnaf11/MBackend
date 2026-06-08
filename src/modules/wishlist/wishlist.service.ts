import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { Prisma } from "../../../generated/prisma/client";
import { ListWishlistDto } from "./dto/list-wishlist.dto";


// What we include when fetching wishlist items — enough for a product card.
const wishlistItemInclude = {
  variant: {
    select: {
      id: true,
      sku: true,
      title: true,
      price: true,
      compareAtPrice: true,
      currency: true,
      isActive: true,
      attributes: true,
      images: {
        orderBy: { sortOrder: "asc" as const },
        take: 1, // thumbnail only
      },
      product: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          brand: {
            select: { id: true, name: true, slug: true },
          },
          seller: {
            select: { id: true, storeName: true, slug: true },
          },
          images: {
            where: { variantId: null },
            orderBy: { sortOrder: "asc" as const },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.WishlistItemInclude;

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── GET MY WISHLIST ───────────────────────────────────────────────────────

  async findMine(userId: string, query: ListWishlistDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.wishlistItem.findMany({
        where: { userId },
        include: wishlistItemInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.wishlistItem.count({ where: { userId } }),
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

  // ─── ADD TO WISHLIST ───────────────────────────────────────────────────────

  async addItem(userId: string, variantId: string) {
    // Verify the variant exists and is active.
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, isActive: true, product: { select: { status: true } } },
    });

    if (!variant || !variant.isActive) {
      throw new NotFoundException("Product variant not found or unavailable.");
    }

    // Check for duplicate — @@unique([userId, variantId]) on the model
    // would throw a Prisma error, but we give a cleaner message here.
    const existing = await this.prisma.wishlistItem.findUnique({
      where: { userId_variantId: { userId, variantId } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("This item is already in your wishlist.");
    }

    return this.prisma.wishlistItem.create({
      data: { userId, variantId },
      include: wishlistItemInclude,
    });
  }

  // ─── REMOVE FROM WISHLIST ──────────────────────────────────────────────────

  async removeItem(userId: string, variantId: string): Promise<void> {
    // findUnique with the composite unique key so we also verify ownership.
    const item = await this.prisma.wishlistItem.findUnique({
      where: { userId_variantId: { userId, variantId } },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException("Item not found in your wishlist.");
    }

    await this.prisma.wishlistItem.delete({ where: { id: item.id } });
  }

  // ─── CLEAR WISHLIST ────────────────────────────────────────────────────────

  async clearMine(userId: string): Promise<void> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId } });
  }

  // ─── CHECK IF ITEM IS WISHLISTED ───────────────────────────────────────────
  // Useful for the frontend to show a filled/unfilled heart icon on product pages.

  async checkItem(userId: string, variantId: string) {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { userId_variantId: { userId, variantId } },
      select: { id: true, createdAt: true },
    });

    return { wishlisted: !!item, addedAt: item?.createdAt ?? null };
  }
}
