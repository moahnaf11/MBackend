import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SellerStatus, UserRole } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ApplySellerDto } from "./dto/apply-seller.dto";
import { ConfirmSellerBannerDto } from "./dto/confirm-seller-banner.dto";
import { ConfirmSellerDocumentDto } from "./dto/confirm-seller-document.dto";
import { ConfirmSellerLogoDto } from "./dto/confirm-seller-logo.dto";
import { CreateSellerBannerUploadUrlDto } from "./dto/create-seller-banner-upload-url.dto";
import { CreateSellerDocumentUploadUrlDto } from "./dto/create-seller-document-upload-url.dto";
import { CreateSellerLogoUploadUrlDto } from "./dto/create-seller-logo-upload-url.dto";
import { UpdateSellerProfileDto } from "./dto/update-seller-profile.dto";
import { UpdateSellerStatusDto } from "./dto/update-seller-status.dto";

const SELLER_PROFILE_SELECT = {
  id: true,
  userId: true,
  storeName: true,
  slug: true,
  legalName: true,
  taxId: true,
  supportEmail: true,
  logoUrl: true,
  bannerUrl: true,
  description: true,
  shippingPolicy: true,
  returnPolicy: true,
  status: true,
  rating: true,
  totalSales: true,
  fulfillmentScore: true,
  cancellationRate: true,
  statusReason: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatarUrl: true,
      status: true,
      roles: true,
      emailVerifiedAt: true,
    },
  },
} satisfies Prisma.SellerProfileSelect;

const PUBLIC_SELLER_PROFILE_SELECT = {
  id: true,
  storeName: true,
  slug: true,
  supportEmail: true,
  logoUrl: true,
  bannerUrl: true,
  description: true,
  shippingPolicy: true,
  returnPolicy: true,
  rating: true,
  totalSales: true,
  status: true,
  createdAt: true,
} satisfies Prisma.SellerProfileSelect;

export type SellerProfileResponse = Prisma.SellerProfileGetPayload<{
  select: typeof SELLER_PROFILE_SELECT;
}>;

@Injectable()
export class SellerProfileService {
  private readonly logoFolder = "seller-logos";
  private readonly bannerFolder = "seller-banners";
  private readonly documentFolder = "seller-documents";
  private readonly sellerDocumentContentTypes = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async apply(userId: string, dto: ApplySellerDto): Promise<SellerProfileResponse> {
    const existingProfile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (existingProfile) {
      throw new ConflictException("You already have a seller profile.");
    }

    await this.ensureUserExists(userId);
    const slug = await this.createUniqueSlug(dto.storeName);

    return this.prisma.sellerProfile.create({
      data: {
        userId,
        storeName: dto.storeName.trim(),
        slug,
        legalName: this.normalizeOptionalString(dto.legalName),
        taxId: this.normalizeOptionalString(dto.taxId),
        supportEmail: this.normalizeOptionalString(dto.supportEmail),
        description: this.normalizeOptionalString(dto.description),
        status: SellerStatus.PENDING,
      },
      select: SELLER_PROFILE_SELECT,
    });
  }

  async findMine(userId: string): Promise<SellerProfileResponse> {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: SELLER_PROFILE_SELECT,
    });

    if (!profile) {
      throw new NotFoundException("Seller profile was not found.");
    }

    return profile;
  }

  async updateMine(userId: string, dto: UpdateSellerProfileDto): Promise<SellerProfileResponse> {
    const profile = await this.findMine(userId);
    return this.updateById(profile.id, dto);
  }

  async createLogoUploadUrl(userId: string, dto: CreateSellerLogoUploadUrlDto) {
    const profile = await this.findMine(userId);

    return this.storage.createPresignedImageUpload({
      folder: this.logoFolder,
      ownerId: profile.id,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
    });
  }

  async confirmLogoUpload(
    userId: string,
    dto: ConfirmSellerLogoDto,
  ): Promise<SellerProfileResponse> {
    const profile = await this.findMine(userId);
    this.storage.assertObjectKeyBelongsToOwner(dto.objectKey, this.logoFolder, profile.id);
    await this.storage.assertObjectExists(dto.objectKey);

    return this.prisma.sellerProfile.update({
      where: { id: profile.id },
      data: { logoUrl: this.storage.getPublicUrl(dto.objectKey) },
      select: SELLER_PROFILE_SELECT,
    });
  }

  async deleteLogo(userId: string): Promise<SellerProfileResponse> {
    const profile = await this.findMine(userId);

    await this.prisma.sellerProfile.update({
      where: { id: profile.id },
      data: { logoUrl: null },
      select: { id: true },
    });

    if (profile.logoUrl) {
      try {
        await this.storage.deleteObjectByPublicUrl(profile.logoUrl);
      } catch {
        // Profile state wins; object cleanup can be retried later.
      }
    }

    return this.findMine(userId);
  }

  async createBannerUploadUrl(userId: string, dto: CreateSellerBannerUploadUrlDto) {
    const profile = await this.findMine(userId);

    return this.storage.createPresignedImageUpload({
      folder: this.bannerFolder,
      ownerId: profile.id,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
    });
  }

  async confirmBannerUpload(
    userId: string,
    dto: ConfirmSellerBannerDto,
  ): Promise<SellerProfileResponse> {
    const profile = await this.findMine(userId);
    this.storage.assertObjectKeyBelongsToOwner(dto.objectKey, this.bannerFolder, profile.id);
    await this.storage.assertObjectExists(dto.objectKey);

    return this.prisma.sellerProfile.update({
      where: { id: profile.id },
      data: { bannerUrl: this.storage.getPublicUrl(dto.objectKey) },
      select: SELLER_PROFILE_SELECT,
    });
  }

  async deleteBanner(userId: string): Promise<SellerProfileResponse> {
    const profile = await this.findMine(userId);

    await this.prisma.sellerProfile.update({
      where: { id: profile.id },
      data: { bannerUrl: null },
      select: { id: true },
    });

    if (profile.bannerUrl) {
      try {
        await this.storage.deleteObjectByPublicUrl(profile.bannerUrl);
      } catch {
        // Profile state wins; object cleanup can be retried later.
      }
    }

    return this.findMine(userId);
  }

  async createDocumentUploadUrl(userId: string, dto: CreateSellerDocumentUploadUrlDto) {
    const profile = await this.findMine(userId);

    return this.storage.createPresignedUpload({
      folder: this.documentFolder,
      ownerId: profile.id,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      allowedContentTypes: this.sellerDocumentContentTypes,
      maxSizeBytes: 5 * 1024 * 1024,
    });
  }

  async confirmDocumentUpload(userId: string, dto: ConfirmSellerDocumentDto) {
    const profile = await this.findMine(userId);
    this.storage.assertObjectKeyBelongsToOwner(dto.objectKey, this.documentFolder, profile.id);
    await this.storage.assertObjectExists(dto.objectKey);

    return this.prisma.sellerVerificationDocument.create({
      data: {
        sellerId: profile.id,
        type: dto.type,
        fileUrl: this.storage.getPublicUrl(dto.objectKey),
        fileName: this.normalizeOptionalString(dto.fileName),
        contentType: this.normalizeOptionalString(dto.contentType),
      },
    });
  }

  async listMineDocuments(userId: string) {
    const profile = await this.findMine(userId);

    return this.prisma.sellerVerificationDocument.findMany({
      where: { sellerId: profile.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async findPublicBySlug(slug: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { slug },
      select: PUBLIC_SELLER_PROFILE_SELECT,
    });

    if (profile && profile.status === SellerStatus.ACTIVE) {
      return profile;
    }

    const slugHistory = await this.prisma.sellerSlugHistory.findUnique({
      where: { slug },
      select: {
        seller: {
          select: PUBLIC_SELLER_PROFILE_SELECT,
        },
      },
    });

    if (!slugHistory || slugHistory.seller.status !== SellerStatus.ACTIVE) {
      throw new NotFoundException("Seller store was not found.");
    }

    return {
      ...slugHistory.seller,
      redirectedFromSlug: slug,
    };
  }

  async findAll(params: {
    status?: SellerStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: SellerProfileResponse[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const where: Prisma.SellerProfileWhereInput = {};

    if (params.status) where.status = params.status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.sellerProfile.findMany({
        where,
        select: SELLER_PROFILE_SELECT,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.sellerProfile.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string): Promise<SellerProfileResponse> {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { id },
      select: SELLER_PROFILE_SELECT,
    });

    if (!profile) {
      throw new NotFoundException(`Seller profile ${id} was not found.`);
    }

    return profile;
  }

  async updateById(id: string, dto: UpdateSellerProfileDto): Promise<SellerProfileResponse> {
    const profile = await this.findById(id);
    const storeName = this.normalizeOptionalString(dto.storeName);
    const nextSlug =
      storeName !== undefined ? await this.createUniqueSlug(storeName, id) : undefined;

    return this.prisma.$transaction(async (tx) => {
      const updatedProfile = await tx.sellerProfile.update({
        where: { id },
        data: {
          ...(storeName !== undefined && {
            storeName,
            slug: nextSlug,
          }),
          ...(dto.legalName !== undefined && {
            legalName: this.normalizeOptionalString(dto.legalName),
          }),
          ...(dto.taxId !== undefined && {
            taxId: this.normalizeOptionalString(dto.taxId),
          }),
          ...(dto.supportEmail !== undefined && {
            supportEmail: this.normalizeOptionalString(dto.supportEmail),
          }),
          ...(dto.description !== undefined && {
            description: this.normalizeOptionalString(dto.description),
          }),
          ...(dto.shippingPolicy !== undefined && {
            shippingPolicy: this.normalizeOptionalString(dto.shippingPolicy),
          }),
          ...(dto.returnPolicy !== undefined && {
            returnPolicy: this.normalizeOptionalString(dto.returnPolicy),
          }),
        },
        select: SELLER_PROFILE_SELECT,
      });

      if (nextSlug && nextSlug !== profile.slug) {
        await tx.sellerSlugHistory.upsert({
          where: { slug: profile.slug },
          create: {
            sellerId: id,
            slug: profile.slug,
          },
          update: {
            sellerId: id,
          },
        });
      }

      return updatedProfile;
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateSellerStatusDto,
    actorUserId?: string,
  ): Promise<SellerProfileResponse> {
    const profile = await this.findById(id);

    return this.prisma.$transaction(async (tx) => {
      await tx.sellerProfile.update({
        where: { id },
        data: {
          status: dto.status,
          statusReason: this.normalizeOptionalString(dto.reason),
          reviewedAt:
            dto.status === SellerStatus.ACTIVE ||
            dto.status === SellerStatus.REJECTED ||
            dto.status === SellerStatus.SUSPENDED
              ? new Date()
              : undefined,
        },
      });

      await tx.sellerStatusEvent.create({
        data: {
          sellerId: id,
          actorUserId,
          fromStatus: profile.status,
          toStatus: dto.status,
          reason: this.normalizeOptionalString(dto.reason),
        },
      });

      const currentRoles = profile.user.roles;
      const nextRoles =
        dto.status === SellerStatus.ACTIVE
          ? Array.from(new Set([...currentRoles, UserRole.SELLER]))
          : currentRoles.filter((role) => role !== UserRole.SELLER);

      await tx.user.update({
        where: { id: profile.userId },
        data: { roles: { set: nextRoles } },
        select: { id: true },
      });

      const updatedProfile = await tx.sellerProfile.findUnique({
        where: { id },
        select: SELLER_PROFILE_SELECT,
      });

      if (!updatedProfile) {
        throw new NotFoundException(`Seller profile ${id} was not found.`);
      }

      return updatedProfile;
    });
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} was not found.`);
    }
  }

  private async createUniqueSlug(storeName: string, currentSellerId?: string): Promise<string> {
    const baseSlug = this.slugify(storeName);

    if (!baseSlug) {
      throw new BadRequestException("Store name must contain letters or numbers.");
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      const existing = await this.prisma.sellerProfile.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existing || existing.id === currentSellerId) {
        return slug;
      }
    }

    throw new ConflictException("Could not create a unique store slug.");
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private normalizeOptionalString(value: string | undefined): string | undefined {
    return value?.trim();
  }
}
