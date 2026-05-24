import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { CreateCategoryDto } from "./dto/create-category.dto";

import { UpdateCategoryStatusDto } from "./dto/update-category-status.dto";
import { Category } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { MoveCategoryDto } from "./dto/move-category.dto";

// A category with its children nested inside — used for the tree response
export type CategoryNode = Category & { children: CategoryNode[] };

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── private helpers ──────────────────────────────────────────────────────

  // Find by ID — used internally. Always throws 404 if missing.
  private async findById(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  // Walk up the parent chain from nodeId.
  // If we ever find ancestorId in that chain, it means moving ancestorId
  // under nodeId would create a circular reference — throw immediately.
  private async assertNotDescendant(ancestorId: string, nodeId: string): Promise<void> {
    let currentId: string | null = nodeId;

    while (currentId) {
      if (currentId === ancestorId) {
        throw new BadRequestException(
          "Cannot move a category under one of its own descendants — this would create a circular reference.",
        );
      }
      const current: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });

      currentId = current?.parentId ?? null;
    }
  }

  // Check whether a slug is already taken by a DIFFERENT category.
  private async assertSlugAvailable(slug: string, excludeId?: string): Promise<void> {
    const conflict = await this.prisma.category.findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (conflict) {
      throw new ConflictException(`Slug "${slug}" is already taken`);
    }
  }

  // ─── findAll ──────────────────────────────────────────────────────────────

  // Returns a flat array of categories.
  // includeInactive=true is only passed through when the caller is an admin
  // (the controller is responsible for that check).
  async findAll(options: { includeInactive?: boolean } = {}): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: options.includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  // ─── findTree ─────────────────────────────────────────────────────────────

  // Returns the full category hierarchy as a nested tree.
  // Prisma doesn't support recursive queries natively, so we:
  //   1. Fetch all active categories in one DB call (flat array)
  //   2. Build a Map keyed by ID
  //   3. Loop once, attaching each node to its parent's children array
  //   4. Return only the root nodes — descendants are already nested inside
  //
  // This is O(n) — one pass regardless of tree depth.
  async findTree(): Promise<CategoryNode[]> {
    const all = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    // Step 1: seed the map — every category starts with an empty children array
    const map = new Map<string, CategoryNode>();
    for (const cat of all) {
      map.set(cat.id, { ...cat, children: [] });
    }

    // Step 2: attach each category to its parent
    const roots: CategoryNode[] = [];
    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        // No parent (or parent is inactive/missing) → root node
        roots.push(node);
      }
    }

    return roots;
  }

  // ─── findBySlug ───────────────────────────────────────────────────────────

  // Returns a single category by its URL slug, plus its direct active children.
  // Used when a shopper clicks a category link.
  async findBySlug(slug: string): Promise<Category & { children: Category[] }> {
    const category = await this.prisma.category.findFirst({
      where: { slug, isActive: true },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category "${slug}" not found`);
    }

    return category;
  }

  // ─── create ───────────────────────────────────────────────────────────────

  async create(dto: CreateCategoryDto): Promise<Category> {
    // Slug must be globally unique
    await this.assertSlugAvailable(dto.slug);

    // If a parent is specified, make sure it actually exists
    if (dto.parentId) {
      await this.findById(dto.parentId);
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        parentId: dto.parentId ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  // ─── update ───────────────────────────────────────────────────────────────

  // Updates name, slug, description, or isActive.
  // parentId changes are intentionally excluded — use moveToParent() instead
  // so the circular-reference check always runs.
  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.findById(id);

    // If the slug is changing, make sure the new one is available
    if (dto.slug) {
      await this.assertSlugAvailable(dto.slug, id);
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  // ─── moveToParent ─────────────────────────────────────────────────────────

  // Moves a category to a different parent (or to the top level if parentId=null).
  // The circular-reference check prevents infinite loops in the tree.
  async moveToParent(id: string, dto: MoveCategoryDto): Promise<Category> {
    await this.findById(id);

    if (dto.parentId) {
      // Make sure the new parent exists
      await this.findById(dto.parentId);

      // Make sure the new parent is not a descendant of this category
      await this.assertNotDescendant(id, dto.parentId);
    }

    return this.prisma.category.update({
      where: { id },
      data: { parentId: dto.parentId ?? null },
    });
  }

  // ─── updateStatus ─────────────────────────────────────────────────────────

  // Shows or hides a category (isActive toggle).
  // This is the preferred way to "delete" a category — reversible at any time.
  async updateStatus(id: string, dto: UpdateCategoryStatusDto): Promise<Category> {
    await this.findById(id);

    return this.prisma.category.update({
      where: { id },
      data: { isActive: dto.isActive },
    });
  }

  // ─── remove ───────────────────────────────────────────────────────────────

  // Hard deletes a category. Blocked if:
  //   - it has child categories (would orphan them)
  //   - products are assigned to it (would silently remove those assignments)
  // In practice, prefer updateStatus(false) over hard delete.
  async remove(id: string): Promise<void> {
    await this.findById(id);

    // Block if child categories exist
    const childCount = await this.prisma.category.count({
      where: { parentId: id },
    });
    if (childCount > 0) {
      throw new ConflictException(
        `Cannot delete this category — it has ${childCount} child ${childCount === 1 ? "category" : "categories"}. Move or delete them first.`,
      );
    }

    // Block if products are assigned to this category
    const productCount = await this.prisma.productCategory.count({
      where: { categoryId: id },
    });
    if (productCount > 0) {
      throw new ConflictException(
        `Cannot delete this category — ${productCount} ${productCount === 1 ? "product is" : "products are"} assigned to it. Reassign them first.`,
      );
    }

    await this.prisma.category.delete({ where: { id } });
  }
}
