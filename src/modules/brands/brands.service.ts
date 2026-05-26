import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Brand, Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { CreateBrandDto } from "./dto/create-brand.dto";
import { UpdateBrandDto } from "./dto/update-brand.dto";


@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── private helpers ──────────────────────────────────────────────────────

  // Reused by update and delete to get a clean 404 before doing anything.
  private async findById(id: string): Promise<Brand> {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException(`Brand ${id} not found`);
    return brand;
  }

  // Checks whether a name or slug is already taken by a DIFFERENT brand.
  // excludeId lets us skip the current brand when updating (so a brand
  // can "update" with the same name/slug it already has without conflict).
  private async assertUnique(
    dto: { name?: string; slug?: string },
    excludeId?: string,
  ): Promise<void> {
    const notSelf = excludeId ? { id: { not: excludeId } } : {};

    if (dto.name) {
      const nameConflict = await this.prisma.brand.findFirst({
        where: { name: dto.name, ...notSelf },
      });
      if (nameConflict) {
        throw new ConflictException(`Brand name "${dto.name}" is already taken`);
      }
    }

    if (dto.slug) {
      const slugConflict = await this.prisma.brand.findFirst({
        where: { slug: dto.slug, ...notSelf },
      });
      if (slugConflict) {
        throw new ConflictException(`Slug "${dto.slug}" is already taken`);
      }
    }
  }

  // ─── findAll ──────────────────────────────────────────────────────────────

  async findAll(search?: string): Promise<Brand[]> {
    const where: Prisma.BrandWhereInput = search
      ? { name: { contains: search, mode: "insensitive" } }
      : {};

    return this.prisma.brand.findMany({
      where,
      orderBy: { name: "asc" },
    });
  }

  // ─── findBySlug ───────────────────────────────────────────────────────────

  async findBySlug(slug: string): Promise<Brand> {
    const brand = await this.prisma.brand.findUnique({ where: { slug } });
    if (!brand) throw new NotFoundException(`Brand "${slug}" not found`);
    return brand;
  }

  // ─── create ───────────────────────────────────────────────────────────────

  async create(dto: CreateBrandDto): Promise<Brand> {
    await this.assertUnique({ name: dto.name, slug: dto.slug });

    return this.prisma.brand.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        logoUrl: dto.logoUrl,
      },
    });
  }

  // ─── update ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateBrandDto): Promise<Brand> {
    await this.findById(id);

    // Only check uniqueness for the fields actually being changed
    await this.assertUnique({ name: dto.name, slug: dto.slug }, id);

    return this.prisma.brand.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
      },
    });
  }

  // ─── remove ───────────────────────────────────────────────────────────────

  // Hard delete. Blocked if any products reference this brand.
  // Your schema uses onDelete: SetNull on Product → Brand, which means Prisma
  // would silently null the brandId on all products if you deleted here without
  // checking. We block it intentionally so admins know what they're doing.
  async remove(id: string): Promise<void> {
    await this.findById(id);

    const productCount = await this.prisma.product.count({
      where: { brandId: id },
    });

    if (productCount > 0) {
      throw new ConflictException(
        `Cannot delete this brand — ${productCount} ${
          productCount === 1 ? "product references" : "products reference"
        } it. Reassign them to another brand first.`,
      );
    }

    await this.prisma.brand.delete({ where: { id } });
  }
}
