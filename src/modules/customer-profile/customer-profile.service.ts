import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ConfirmCustomerAvatarDto } from "./dto/confirm-customer-avatar.dto";
import { CreateAvatarUploadUrlDto } from "./dto/create-avatar-upload-url.dto";
import { UpsertCustomerProfileDto } from "./dto/upsert-customer-profile.dto";

const CUSTOMER_PROFILE_SELECT = {
  id: true,
  userId: true,
  displayName: true,
  birthDate: true,
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
} satisfies Prisma.CustomerProfileSelect;

export type CustomerProfileResponse = Prisma.CustomerProfileGetPayload<{
  select: typeof CUSTOMER_PROFILE_SELECT;
}>;

@Injectable()
export class CustomerProfileService {
  private readonly avatarFolder = "avatars/users";

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findMine(userId: string): Promise<CustomerProfileResponse> {
    return this.findByUserId(userId);
  }

  async findByUserId(userId: string): Promise<CustomerProfileResponse> {
    const profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
      select: CUSTOMER_PROFILE_SELECT,
    });

    if (!profile) {
      throw new NotFoundException(`Customer profile for user ${userId} was not found.`);
    }

    return profile;
  }

  async upsertMine(userId: string, dto: UpsertCustomerProfileDto): Promise<CustomerProfileResponse> {
    return this.upsertForUser(userId, dto);
  }

  async createAvatarUploadUrl(userId: string, dto: CreateAvatarUploadUrlDto) {
    await this.ensureProfileExists(userId);

    return this.storage.createPresignedImageUpload({
      folder: this.avatarFolder,
      ownerId: userId,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
    });
  }

  async confirmAvatarUpload(
    userId: string,
    dto: ConfirmCustomerAvatarDto,
  ): Promise<CustomerProfileResponse> {
    await this.ensureProfileExists(userId);
    this.storage.assertObjectKeyBelongsToOwner(dto.objectKey, this.avatarFolder, userId);
    await this.storage.assertObjectExists(dto.objectKey);

    const avatarUrl = this.storage.getPublicUrl(dto.objectKey);

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { id: true },
    });

    return this.findByUserId(userId);
  }

  async deleteAvatar(userId: string): Promise<CustomerProfileResponse> {
    const profile = await this.findByUserId(userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: { id: true },
    });

    if (profile.user.avatarUrl) {
      try {
        await this.storage.deleteObjectByPublicUrl(profile.user.avatarUrl);
      } catch {
        // The database is the source of truth; failed object cleanup can be retried later.
      }
    }

    return this.findByUserId(userId);
  }

  async upsertForUser(
    userId: string,
    dto: UpsertCustomerProfileDto,
  ): Promise<CustomerProfileResponse> {
    await this.ensureUserExists(userId);

    return this.prisma.customerProfile.upsert({
      where: { userId },
      create: {
        userId,
        displayName: this.normalizeOptionalString(dto.displayName),
        birthDate: this.toOptionalDate(dto.birthDate),
      },
      update: {
        ...(dto.displayName !== undefined && {
          displayName: this.normalizeOptionalString(dto.displayName),
        }),
        ...(dto.birthDate !== undefined && {
          birthDate: this.toOptionalDate(dto.birthDate),
        }),
      },
      select: CUSTOMER_PROFILE_SELECT,
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

  private async ensureProfileExists(userId: string): Promise<void> {
    await this.findByUserId(userId);
  }

  private normalizeOptionalString(value: string | undefined): string | undefined {
    return value?.trim();
  }

  private toOptionalDate(value: string | undefined): Date | undefined {
    if (value === undefined) return undefined;
    return new Date(value);
  }
}
