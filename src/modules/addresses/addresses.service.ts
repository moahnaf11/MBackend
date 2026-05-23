import { Injectable, NotFoundException } from "@nestjs/common";

import { CreateAddressDto } from "./dto/create-address.dto";
import { UpdateAddressDto } from "./dto/update-address.dto";
import { PrismaService } from "../../database/prisma.service";
import { Address } from "../../../generated/prisma/client";

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── helpers ─────────────────────────────────────────────────────────────

  // Finds an address by ID and verifies it belongs to the given userId.
  // Always throws 404 (never 403) so we don't leak that an address
  // exists for a different user.
  private async findAndVerifyOwnership(userId: string, addressId: string): Promise<Address> {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address || address.userId !== userId) {
      throw new NotFoundException("Address not found");
    }

    return address;
  }

  // Clears isDefault on all addresses for this user except the one
  // being set as default (if any). Used by create and update as well
  // as setDefault.
  private async clearDefaultsForUser(userId: string, exceptAddressId?: string): Promise<void> {
    await this.prisma.address.updateMany({
      where: {
        userId,
        ...(exceptAddressId ? { id: { not: exceptAddressId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  // ─── findAll ──────────────────────────────────────────────────────────────

  async findAll(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [
        { isDefault: "desc" }, // default address always first
        { createdAt: "desc" },
      ],
    });
  }

  // ─── findDefault ──────────────────────────────────────────────────────────

  async findDefault(userId: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({
      where: { userId, isDefault: true },
    });

    if (!address) {
      throw new NotFoundException("No default address found");
    }

    return address;
  }

  // ─── findOne ──────────────────────────────────────────────────────────────

  async findOne(userId: string, addressId: string): Promise<Address> {
    return this.findAndVerifyOwnership(userId, addressId);
  }

  // ─── create ───────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    const existingCount = await this.prisma.address.count({
      where: { userId },
    });

    // If this is their very first address, always make it default regardless
    // of what the client sent. A user must always have a default if they
    // have at least one address.
    const shouldBeDefault = dto.isDefault === true || existingCount === 0;

    if (shouldBeDefault) {
      // Clear the default flag off every existing address first
      await this.clearDefaultsForUser(userId);
    }

    return this.prisma.address.create({
      data: {
        fullName: dto.fullName,
        line1: dto.line1,
        line2: dto.line2,
        city: dto.city,
        region: dto.region,
        postalCode: dto.postalCode,
        country: dto.country,
        phone: dto.phone,
        type: dto.type,
        isDefault: shouldBeDefault,
        userId,
      },
    });
  }

  // ─── update ───────────────────────────────────────────────────────────────

  async update(userId: string, addressId: string, dto: UpdateAddressDto): Promise<Address> {
    // Verify ownership — throws 404 if not found or not owned by this user
    await this.findAndVerifyOwnership(userId, addressId);

    // If upgrading this address to default, clear all others first
    if (dto.isDefault === true) {
      await this.clearDefaultsForUser(userId, addressId);
    }

    return this.prisma.address.update({
      where: { id: addressId },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.line1 !== undefined && { line1: dto.line1 }),
        ...(dto.line2 !== undefined && { line2: dto.line2 }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.region !== undefined && { region: dto.region }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  // ─── remove ───────────────────────────────────────────────────────────────

  async remove(userId: string, addressId: string): Promise<void> {
    const address = await this.findAndVerifyOwnership(userId, addressId);

    await this.prisma.address.delete({ where: { id: addressId } });

    // If we just deleted the default address, auto-promote the most
    // recently created remaining address so the user is never left
    // with addresses but no default.
    if (address.isDefault) {
      const next = await this.prisma.address.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

      if (next) {
        await this.prisma.address.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  }

  // ─── setDefault ───────────────────────────────────────────────────────────

  async setDefault(userId: string, addressId: string): Promise<Address> {
    // Verify ownership first
    await this.findAndVerifyOwnership(userId, addressId);

    // $transaction ensures both writes are atomic.
    // If anything crashes between them, both are rolled back.
    // Without this, a crash between step 1 and step 2 would leave
    // the user with ZERO default addresses permanently.
    await this.prisma.$transaction([
      // Step 1: clear default on ALL addresses for this user
      this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      }),
      // Step 2: set this one as the new default
      this.prisma.address.update({
        where: { id: addressId },
        data: { isDefault: true },
      }),
    ]);

    // Return the freshly updated address
    return this.findAndVerifyOwnership(userId, addressId);
  }
}
