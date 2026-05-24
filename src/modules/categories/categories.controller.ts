import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiConflictResponse,
} from "@nestjs/swagger";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";

import { UpdateCategoryStatusDto } from "./dto/update-category-status.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../users/guards/roles.guard";
import { Roles } from "../users/guards/roles.decorator";
import { UserRole } from "../../../generated/prisma/enums";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { MoveCategoryDto } from "./dto/move-category.dto";
import { AuthenticatedRequest } from "../auth/types/auth.types";


@ApiTags("categories")
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ─── PUBLIC ROUTES ────────────────────────────────────────────────────────
  // No authentication required. Anyone can browse categories.

  // GET /categories
  // Flat list of all active categories.
  // Admins can pass ?includeInactive=true to also see hidden categories.
  @Get()
  @ApiOperation({
    summary: "List all categories (flat)",
    description:
      "Returns a flat array of active categories ordered by name. Admins may pass ?includeInactive=true to include hidden categories.",
  })
  @ApiQuery({
    name: "includeInactive",
    required: false,
    type: Boolean,
    description: "Admin only — include inactive categories in the response",
  })
  @ApiOkResponse({ description: "Flat array of categories" })
  findAll(@Query("includeInactive") includeInactive?: string, @Request() req?: AuthenticatedRequest) {
    // Only pass includeInactive=true if the caller is an admin.
    // Non-admins always get the active-only list, even if they pass the param.
    const isAdmin = req?.user?.roles?.includes(UserRole.ADMIN) ?? false;

    return this.categoriesService.findAll({
      includeInactive: isAdmin && includeInactive === "true",
    });
  }

  // GET /categories/tree
  // IMPORTANT: MUST be declared before /:slug.
  // NestJS matches routes top-to-bottom. If /:slug came first,
  // the string "tree" would be matched as a slug and return 404.
  @Get("tree")
  @ApiOperation({
    summary: "Get the full nested category tree",
    description:
      "Returns all active categories as a nested tree. Used for navigation menus. Each node has a children array containing its subcategories.",
  })
  @ApiOkResponse({ description: "Nested category tree, roots at the top level" })
  findTree() {
    return this.categoriesService.findTree();
  }

  // GET /categories/:slug
  // Returns a single category by its URL slug, plus its direct active children.
  // Declared AFTER /tree so "tree" is never matched as a slug.
  @Get(":slug")
  @ApiOperation({
    summary: "Get a category by slug",
    description:
      "Returns a single category plus its direct active children. Used to render a category page.",
  })
  @ApiParam({ name: "slug", example: "smartphones", description: "URL slug of the category" })
  @ApiOkResponse({ description: "Category with its direct children" })
  @ApiNotFoundResponse({ description: "Category not found or inactive" })
  findBySlug(@Param("slug") slug: string) {
    return this.categoriesService.findBySlug(slug);
  }

  // ─── ADMIN ROUTES ─────────────────────────────────────────────────────────
  // All routes below require JWT authentication and the ADMIN role.

  // POST /categories
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a new category (admin only)" })
  @ApiCreatedResponse({ description: "The created category" })
  @ApiConflictResponse({ description: "Slug already taken" })
  @ApiNotFoundResponse({ description: "Parent category not found" })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  // PATCH /categories/:id
  // Updates name, slug, or description. Parent changes go through /:id/parent.
  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update a category (admin only)",
    description:
      "Update name, slug, or description. To change the parent, use PATCH /:id/parent instead — that endpoint includes a circular-reference safety check.",
  })
  @ApiParam({ name: "id", description: "Category cuid" })
  @ApiOkResponse({ description: "Updated category" })
  @ApiNotFoundResponse({ description: "Category not found" })
  @ApiConflictResponse({ description: "New slug already taken" })
  update(@Param("id") id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  // PATCH /categories/:id/parent
  // Dedicated endpoint for reparenting a category.
  // Runs the circular-reference check before allowing the move.
  @Patch(":id/parent")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Move a category to a different parent (admin only)",
    description:
      "Changes the parent of a category. Send { parentId: null } to promote it to a top-level category. Blocks moves that would create a circular reference (e.g. moving Electronics under one of its own descendants).",
  })
  @ApiParam({ name: "id", description: "Category cuid to move" })
  @ApiOkResponse({ description: "Category with updated parent" })
  @ApiNotFoundResponse({ description: "Category or new parent not found" })
  moveToParent(@Param("id") id: string, @Body() dto: MoveCategoryDto) {
    return this.categoriesService.moveToParent(id, dto);
  }

  // PATCH /categories/:id/status
  // Show or hide a category. Preferred over hard delete — reversible.
  @Patch(":id/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Show or hide a category (admin only)",
    description:
      'Sets isActive to true or false. Hidden categories disappear from the public list and tree. This is the preferred way to "delete" a category — it is fully reversible.',
  })
  @ApiParam({ name: "id", description: "Category cuid" })
  @ApiOkResponse({ description: "Category with updated status" })
  @ApiNotFoundResponse({ description: "Category not found" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateCategoryStatusDto) {
    return this.categoriesService.updateStatus(id, dto);
  }

  // DELETE /categories/:id
  // Hard delete. Blocked if the category has children or assigned products.
  // Prefer PATCH /:id/status (soft delete) over this in most cases.
  @Delete(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Hard delete a category (admin only)",
    description:
      "Permanently removes a category. Blocked if the category has child categories or assigned products. Consider using PATCH /:id/status to hide it instead.",
  })
  @ApiParam({ name: "id", description: "Category cuid" })
  @ApiNoContentResponse({ description: "Category deleted" })
  @ApiNotFoundResponse({ description: "Category not found" })
  @ApiConflictResponse({
    description: "Category has children or assigned products",
  })
  async remove(@Param("id") id: string): Promise<void> {
    await this.categoriesService.remove(id);
  }
}
