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
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../users/guards/roles.guard";
import { Roles } from "../users/guards/roles.decorator";

import { BrandsService } from "./brands.service";
import { UserRole } from "../../../generated/prisma/enums";
import { CreateBrandDto } from "./dto/create-brand.dto";
import { UpdateBrandDto } from "./dto/update-brand.dto";
@ApiTags("brands")
@Controller("brands")
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  // ─── PUBLIC ROUTES ────────────────────────────────────────────────────────

  // GET /brands
  // Returns all brands, optionally filtered by name search.
  // No auth — anyone can browse brands.
  @Get()
  @ApiOperation({
    summary: "List all brands",
    description:
      "Returns all brands ordered alphabetically. Optionally filter by name with ?search=apple.",
  })
  @ApiQuery({
    name: "search",
    required: false,
    type: String,
    description: "Partial name search — case insensitive",
    example: "apple",
  })
  @ApiOkResponse({ description: "Array of brands" })
  findAll(@Query("search") search?: string) {
    return this.brandsService.findAll(search);
  }

  // GET /brands/:slug
  // MUST be declared before any /:id admin routes that could conflict.
  // Uses slug (not ID) because slugs appear in URLs and are human-readable.
  @Get(":slug")
  @ApiOperation({ summary: "Get a brand by slug" })
  @ApiParam({ name: "slug", example: "apple", description: "URL slug of the brand" })
  @ApiOkResponse({ description: "The brand" })
  @ApiNotFoundResponse({ description: "Brand not found" })
  findBySlug(@Param("slug") slug: string) {
    return this.brandsService.findBySlug(slug);
  }

  // ─── ADMIN ROUTES ─────────────────────────────────────────────────────────

  // POST /brands
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a new brand (admin only)" })
  @ApiCreatedResponse({ description: "The created brand" })
  @ApiConflictResponse({ description: "Name or slug already taken" })
  create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  // PATCH /brands/:id
  // Uses ID here (not slug) because the admin knows the exact record.
  // The public-facing GET uses slug for URL friendliness.
  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update a brand (admin only)",
    description: "All fields optional — only send what you want to change.",
  })
  @ApiParam({ name: "id", description: "Brand cuid" })
  @ApiOkResponse({ description: "Updated brand" })
  @ApiNotFoundResponse({ description: "Brand not found" })
  @ApiConflictResponse({ description: "New name or slug already taken" })
  update(@Param("id") id: string, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }

  // DELETE /brands/:id
  // Blocked if any products reference this brand.
  // Returns 204 No Content on success.
  @Delete(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Delete a brand (admin only)",
    description:
      "Permanently deletes the brand. Blocked if any products are assigned to it — reassign them first.",
  })
  @ApiParam({ name: "id", description: "Brand cuid" })
  @ApiNoContentResponse({ description: "Brand deleted" })
  @ApiNotFoundResponse({ description: "Brand not found" })
  @ApiConflictResponse({ description: "Products still reference this brand" })
  async remove(@Param("id") id: string): Promise<void> {
    await this.brandsService.remove(id);
  }
}
