import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";

import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";
import { SetCategoriesDto } from "./dto/set-categories.dto";
import { ListProductsDto } from "./dto/list-products.dto";
import slugify from "slugify";
import { PrismaService } from "../../database/prisma.service";
import { ProductStatus } from "../../../generated/prisma/enums";
import { Prisma } from "../../../generated/prisma/client";
import { StorageService } from "../storage/storage.service";
import { CreateProductImageUploadUrlDto } from "./dto/create-product-image-upload-url.dto";
import { ConfirmProductImageDto } from "./dto/confirm-product-image.dto";

@Injectable()
export class ProductsService {
  private readonly imageFolder = "product-images";
  private readonly maxProductImageBytes = 10 * 1024 * 1024; // 10MB
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  /**
   * Generates a URL-safe slug from a title and appends a short suffix if the
   * base slug is already taken.
   */
  private async generateSlug(title: string, excludeId?: string): Promise<string> {
    const base = slugify(title, { lower: true, strict: true });
    let candidate = base;
    let attempt = 0;

    while (true) {
      const existing = await this.prisma.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing || existing.id === excludeId) {
        return candidate;
      }

      attempt++;
      candidate = `${base}-${attempt}`;
    }
  }

  /**
   * Resolves a seller's profile id from their user id.
   * Throws ForbiddenException if the user has no active seller profile.
   */
  private async resolveSellerProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });

    if (!profile) {
      throw new ForbiddenException("No seller profile found for this account");
    }

    // Only ACTIVE sellers can create/manage listings.
    if (profile.status !== "ACTIVE") {
      throw new ForbiddenException(
        `Your seller account is not active (current status: ${profile.status})`,
      );
    }

    return profile.id;
  }

  /**
   * Finds a product by id and throws NotFoundException if absent.
   */
  private async findProductOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  // ─── LISTING & DETAIL ─────────────────────────────────────────────────────

  async findAll(query: ListProductsDto, isAdmin = false) {
    const { search, categoryId, brandId, sellerId, status, page = 1, limit = 20 } = query;

    // Public callers always get only ACTIVE products.
    const statusFilter: ProductStatus | undefined = isAdmin
      ? (status ?? undefined)
      : ProductStatus.ACTIVE;

    const where: Prisma.ProductWhereInput = {
      ...(statusFilter !== undefined && { status: statusFilter }),
      ...(search && {
        title: { contains: search, mode: "insensitive" },
      }),
      ...(brandId && { brandId }),
      ...(sellerId && { sellerId }),
      ...(categoryId && {
        categories: {
          some: { categoryId },
        },
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
          seller: { select: { id: true, storeName: true, slug: true, rating: true } },
          images: {
            where: { variantId: null },
            orderBy: { sortOrder: "asc" },
            take: 1, // thumbnail only in listings
          },
          variants: {
            where: { isActive: true },
            select: { id: true, price: true, currency: true, compareAtPrice: true },
            orderBy: { price: "asc" },
            take: 1, // cheapest variant for price display
          },
          categories: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
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

  async findBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        brand: true,
        seller: {
          select: {
            id: true,
            storeName: true,
            slug: true,
            rating: true,
            description: true,
            returnPolicy: true,
            shippingPolicy: true,
          },
        },
        variants: {
          where: { isActive: true },
          include: {
            images: { orderBy: { sortOrder: "asc" } },
          },
          orderBy: { price: "asc" },
        },
        images: {
          where: { variantId: null },
          orderBy: { sortOrder: "asc" },
        },
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (!product) throw new NotFoundException("Product not found");

    // Public detail only shows active products.
    if (product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException("Product not found");
    }

    return product;
  }

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        brand: true,
        seller: { select: { id: true, storeName: true, slug: true } },
        variants: { include: { images: true } },
        images: { orderBy: { sortOrder: "asc" } },
        categories: {
          include: { category: true },
        },
      },
    });

    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  async findReviews(productId: string, page: number, limit: number) {
    await this.findProductOrThrow(productId);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: { productId, isVisible: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.review.count({ where: { productId, isVisible: true } }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findQuestions(productId: string, page: number, limit: number) {
    await this.findProductOrThrow(productId);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.productQuestion.findMany({
        where: { productId, isVisible: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          answers: {
            where: { isVisible: true },
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
              seller: { select: { id: true, storeName: true } },
            },
            orderBy: { isAccepted: "desc" },
          },
        },
      }),
      this.prisma.productQuestion.count({ where: { productId, isVisible: true } }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── PRODUCT CRUD ─────────────────────────────────────────────────────────

  async create(dto: CreateProductDto, userId: string) {
    const sellerId = await this.resolveSellerProfileId(userId);

    const slug = dto.slug
      ? await this.ensureSlugAvailable(dto.slug)
      : await this.generateSlug(dto.title);

    // Validate brandId if provided.
    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
      if (!brand) throw new NotFoundException("Brand not found");
    }

    // Validate categoryIds if provided.
    if (dto.categoryIds?.length) {
      await this.validateCategoryIds(dto.categoryIds);
    }

    return this.prisma.product.create({
      data: {
        sellerId,
        brandId: dto.brandId ?? null,
        title: dto.title,
        slug,
        description: dto.description,
        status: ProductStatus.DRAFT,
        ...(dto.categoryIds?.length && {
          categories: {
            create: dto.categoryIds.map((categoryId) => ({ categoryId })),
          },
        }),
      },
      include: {
        brand: true,
        categories: { include: { category: true } },
      },
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findProductOrThrow(id);

    const data: Prisma.ProductUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;

    if (dto.slug !== undefined) {
      data.slug = await this.ensureSlugAvailable(dto.slug, id);
    }

    if (dto.brandId !== undefined) {
      if (dto.brandId) {
        const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
        if (!brand) throw new NotFoundException("Brand not found");
      }
      data.brand = dto.brandId ? { connect: { id: dto.brandId } } : { disconnect: true };
    }

    return this.prisma.product.update({
      where: { id },
      data,
      include: { brand: true, categories: { include: { category: true } } },
    });
  }

  async publish(id: string) {
    const product = await this.findProductOrThrow(id);

    if (product.status === ProductStatus.ACTIVE) {
      throw new ConflictException("Product is already active");
    }

    // Require at least one active variant before publishing.
    const variantCount = await this.prisma.productVariant.count({
      where: { productId: id, isActive: true },
    });
    if (variantCount === 0) {
      throw new BadRequestException(
        "A product must have at least one active variant before it can be published",
      );
    }

    return this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ACTIVE },
    });
  }

  async archive(id: string) {
    const product = await this.findProductOrThrow(id);

    if (product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException("Product is already archived");
    }

    return this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ARCHIVED },
    });
  }

  async setStatus(id: string, status: ProductStatus) {
    await this.findProductOrThrow(id);
    return this.prisma.product.update({ where: { id }, data: { status } });
  }

  async remove(id: string) {
    await this.findProductOrThrow(id);

    // Hard delete — Prisma cascades handle variants, images, categories.
    // Blocked at DB level if order items reference variants (onDelete: Restrict).
    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (e: unknown) {
      if (e instanceof Error && "code" in e && e.code === "P2003") {
        throw new ConflictException(
          "Cannot delete: product variants are referenced by existing orders. Archive the product instead.",
        );
      }
      throw e;
    }
  }

  // ─── VARIANTS ─────────────────────────────────────────────────────────────

  async addVariant(productId: string, dto: CreateVariantDto) {
    await this.findProductOrThrow(productId);

    const skuTaken = await this.prisma.productVariant.findUnique({
      where: { sku: dto.sku },
    });
    if (skuTaken) throw new ConflictException(`SKU '${dto.sku}' is already in use`);

    return this.prisma.productVariant.create({
      data: {
        productId,
        sku: dto.sku,
        title: dto.title,
        price: dto.price,
        compareAtPrice: dto.compareAtPrice ?? null,
        currency: dto.currency ?? "USD",
        weightGrams: dto.weightGrams ?? null,
        attributes: (dto.attributes ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }

  async updateVariant(productId: string, variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!variant) throw new NotFoundException("Variant not found on this product");

    if (dto.sku && dto.sku !== variant.sku) {
      const skuTaken = await this.prisma.productVariant.findUnique({
        where: { sku: dto.sku },
      });
      if (skuTaken) throw new ConflictException(`SKU '${dto.sku}' is already in use`);
    }

    const data: Prisma.ProductVariantUpdateInput = {};
    if (dto.sku !== undefined) data.sku = dto.sku;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.compareAtPrice !== undefined) data.compareAtPrice = dto.compareAtPrice;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.weightGrams !== undefined) data.weightGrams = dto.weightGrams;
    if (dto.attributes !== undefined) data.attributes = dto.attributes as Prisma.InputJsonValue;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.productVariant.update({ where: { id: variantId }, data });
  }

  async deactivateVariant(productId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!variant) throw new NotFoundException("Variant not found on this product");

    // Don't hard-delete — order history references variants.
    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: { isActive: false },
    });
  }

  // ─── IMAGES ───────────────────────────────────────────────────────────────

  async createImageUploadUrl(productId: string, dto: CreateProductImageUploadUrlDto) {
    await this.findProductOrThrow(productId);

    // Validate variant ownership if provided.
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: {
          id: dto.variantId,
          productId,
        },
        select: { id: true },
      });

      if (!variant) {
        throw new NotFoundException("Variant not found on this product");
      }
    }

    return this.storage.createPresignedUpload({
      folder: this.imageFolder,
      ownerId: productId,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      maxSizeBytes: this.maxProductImageBytes,
    });
  }

  async confirmImageUpload(productId: string, dto: ConfirmProductImageDto) {
    await this.findProductOrThrow(productId);

    // Validate variant ownership if provided.
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: {
          id: dto.variantId,
          productId,
        },
        select: { id: true },
      });

      if (!variant) {
        throw new NotFoundException("Variant not found on this product");
      }
    }

    // Security check:
    // Ensure uploaded object belongs to this product's image folder.
    this.storage.assertObjectKeyBelongsToOwner(dto.objectKey, this.imageFolder, productId);

    // Ensure upload actually exists in storage.
    await this.storage.assertObjectExists(dto.objectKey);

    return this.prisma.productImage.create({
      data: {
        productId,
        variantId: dto.variantId ?? null,
        objectKey: dto.objectKey,
        url: this.storage.getPublicUrl(dto.objectKey),
        altText: dto.altText ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async removeImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: {
        id: imageId,
        productId,
      },
    });

    if (!image) {
      throw new NotFoundException("Image not found on this product");
    }

    // Delete DB row first so product state updates immediately.
    await this.prisma.productImage.delete({
      where: { id: imageId },
    });

    // Best-effort storage cleanup.
    try {
      await this.storage.deleteObjectByPublicUrl(image.url);
    } catch {
      // DB state wins; orphan cleanup can run later.
    }
  }

  // ─── CATEGORIES ───────────────────────────────────────────────────────────

  async setCategories(productId: string, dto: SetCategoriesDto) {
    await this.findProductOrThrow(productId);

    if (dto.categoryIds.length) {
      await this.validateCategoryIds(dto.categoryIds);
    }

    // Replace atomically inside a transaction.
    await this.prisma.$transaction([
      this.prisma.productCategory.deleteMany({ where: { productId } }),
      ...(dto.categoryIds.length
        ? [
            this.prisma.productCategory.createMany({
              data: dto.categoryIds.map((categoryId) => ({ productId, categoryId })),
            }),
          ]
        : []),
    ]);

    return this.findById(productId);
  }

  // ─── PRIVATE VALIDATORS ───────────────────────────────────────────────────

  private async ensureSlugAvailable(slug: string, excludeId?: string): Promise<string> {
    const existing = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Slug '${slug}' is already in use`);
    }
    return slug;
  }

  private async validateCategoryIds(ids: string[]) {
    const found = await this.prisma.category.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      const missing = ids.filter((id) => !found.some((c) => c.id === id));
      throw new NotFoundException(`Category id(s) not found or inactive: ${missing.join(", ")}`);
    }
  }
}
