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
  Put,
  Query,
  Request,
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
import { ProductOwnerGuard } from "./guards/product-owner.guard";
import { ProductsService } from "./products.service";
import { ListProductsDto } from "./dto/list-products.dto";
import { UserRole } from "../../../generated/prisma/enums";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { AdminSetStatusDto, SetCategoriesDto } from "./dto/set-categories.dto";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";
import { AuthenticatedRequest } from "../auth/types/auth.types";
import { ConfirmProductImageDto } from "./dto/confirm-product-image.dto";
import { CreateProductImageUploadUrlDto } from "./dto/create-product-image-upload-url.dto";
import { ReorderProductImagesDto } from "./dto/reorder-product-images.dto";

@ApiTags("products")
@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ─── PUBLIC ROUTES ────────────────────────────────────────────────────────

  // GET /products
  // Public listing — always returns ACTIVE only.
  // Supports filtering by search, brand, seller, category, and pagination.
  @Get()
  @ApiOperation({
    summary: "List active products",
    description:
      "Returns paginated ACTIVE products. Filter with ?search=, ?brandId=, ?sellerId=, ?categoryId=. Supports ?page= and ?limit= (max 100).",
  })
  @ApiOkResponse({ description: "Paginated product listing" })
  findAll(@Query() query: ListProductsDto) {
    return this.productsService.findAll(query, false);
  }

  // GET /products/admin/all
  // MUST be declared before /:slug to avoid "admin" being treated as a slug.
  // Admin-only — returns products of any status, with full filter support.
  @Get("admin/all")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "List all products regardless of status (admin only)",
    description: "Same filters as the public endpoint, plus ?status= to target specific statuses.",
  })
  @ApiOkResponse({ description: "Paginated product listing" })
  findAllAdmin(@Query() query: ListProductsDto) {
    return this.productsService.findAll(query, true);
  }

  // GET /products/:slug
  // Public product detail — returns ACTIVE products only.
  // Uses slug (not ID) because slugs are the canonical public identifier.
  @Get(":slug")
  @ApiOperation({ summary: "Get a product by slug" })
  @ApiParam({
    name: "slug",
    example: "apple-iphone-15-pro",
    description: "URL slug of the product",
  })
  @ApiOkResponse({ description: "Full product detail including variants, images, and categories" })
  @ApiNotFoundResponse({ description: "Product not found or not active" })
  findBySlug(@Param("slug") slug: string) {
    return this.productsService.findBySlug(slug);
  }

  // GET /products/:id/reviews
  // Public paginated reviews for a product.
  @Get(":id/reviews")
  @ApiOperation({ summary: "List reviews for a product" })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Paginated reviews" })
  @ApiNotFoundResponse({ description: "Product not found" })
  findReviews(@Param("id") id: string, @Query("page") page = 1, @Query("limit") limit = 20) {
    return this.productsService.findReviews(id, +page, +limit);
  }

  // GET /products/:id/questions
  // Public paginated Q&A for a product.
  @Get(":id/questions")
  @ApiOperation({ summary: "List questions and answers for a product" })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Paginated questions with their accepted/visible answers" })
  @ApiNotFoundResponse({ description: "Product not found" })
  findQuestions(@Param("id") id: string, @Query("page") page = 1, @Query("limit") limit = 20) {
    return this.productsService.findQuestions(id, +page, +limit);
  }

  // ─── SELLER ROUTES ────────────────────────────────────────────────────────

  // POST /products
  // Creates a product in DRAFT status for the authenticated seller.
  // The seller must have an ACTIVE seller profile.
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create a new product (seller only)",
    description:
      "Creates a product in DRAFT status. Add variants, then POST /products/:id/publish to go live.",
  })
  @ApiCreatedResponse({ description: "The created product in DRAFT status" })
  @ApiConflictResponse({ description: "Slug already taken" })
  create(@Body() dto: CreateProductDto, @Request() req: AuthenticatedRequest) {
    return this.productsService.create(dto, req.user.id);
  }

  // PATCH /products/:id
  // Sellers can update their own products. Admins can update any.
  // ProductOwnerGuard enforces ownership.
  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard, ProductOwnerGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update product details (seller/admin)",
    description:
      "All fields optional. To change categories, use PUT /products/:id/categories instead.",
  })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiOkResponse({ description: "Updated product" })
  @ApiNotFoundResponse({ description: "Product not found" })
  @ApiConflictResponse({ description: "New slug already taken" })
  update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  // POST /products/:id/publish
  // Transitions a product from DRAFT (or ARCHIVED) → ACTIVE.
  // Requires at least one active variant.
  @Post(":id/publish")
  @UseGuards(JwtAuthGuard, RolesGuard, ProductOwnerGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Publish a product (make it live)",
    description:
      "Transitions status to ACTIVE. Requires at least one active variant. Blocked if already active.",
  })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiOkResponse({ description: "Product is now ACTIVE" })
  @ApiConflictResponse({ description: "Product is already active" })
  publish(@Param("id") id: string) {
    return this.productsService.publish(id);
  }

  // POST /products/:id/archive
  // Transitions a product to ARCHIVED (soft-delete for sellers).
  // The product disappears from public listings but order history is preserved.
  @Post(":id/archive")
  @UseGuards(JwtAuthGuard, RolesGuard, ProductOwnerGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Archive a product (soft-delete)",
    description:
      "Hides the product from public listings. Order history is preserved. Blocked if already archived.",
  })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiOkResponse({ description: "Product is now ARCHIVED" })
  @ApiConflictResponse({ description: "Product is already archived" })
  archive(@Param("id") id: string) {
    return this.productsService.archive(id);
  }

  // DELETE /products/:id
  // Hard delete — admin only. Blocked by DB if variants are on orders.
  @Delete(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Permanently delete a product (admin only)",
    description:
      "Hard delete. Cascades to variants, images, and categories. Blocked if any variant is referenced by an order — archive instead.",
  })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiNoContentResponse({ description: "Product deleted" })
  @ApiNotFoundResponse({ description: "Product not found" })
  @ApiConflictResponse({ description: "Variants referenced by orders" })
  async remove(@Param("id") id: string): Promise<void> {
    await this.productsService.remove(id);
  }

  // ─── ADMIN STATUS ─────────────────────────────────────────────────────────

  // PATCH /products/:id/status
  // Admin can force any status transition without the business-logic guards
  // (e.g. bypassing the variant requirement, resetting to DRAFT, etc.)
  @Patch(":id/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Force a product status change (admin only)",
    description:
      "Bypasses normal transition guards. Use for moderation (e.g. force-archiving a violating listing).",
  })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiOkResponse({ description: "Product status updated" })
  setStatus(@Param("id") id: string, @Body() dto: AdminSetStatusDto) {
    return this.productsService.setStatus(id, dto.status);
  }

  // ─── VARIANT ROUTES ───────────────────────────────────────────────────────

  // POST /products/:id/variants
  @Post(":id/variants")
  @UseGuards(JwtAuthGuard, RolesGuard, ProductOwnerGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Add a variant to a product",
    description:
      "SKU must be globally unique. Variants hold the price and inventory — a product with no variants cannot be published.",
  })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiCreatedResponse({ description: "The new variant" })
  @ApiConflictResponse({ description: "SKU already in use" })
  @ApiNotFoundResponse({ description: "Product not found" })
  addVariant(@Param("id") id: string, @Body() dto: CreateVariantDto) {
    return this.productsService.addVariant(id, dto);
  }

  // PATCH /products/:id/variants/:variantId
  @Patch(":id/variants/:variantId")
  @UseGuards(JwtAuthGuard, RolesGuard, ProductOwnerGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a variant" })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiParam({ name: "variantId", description: "Variant cuid" })
  @ApiOkResponse({ description: "Updated variant" })
  @ApiNotFoundResponse({ description: "Variant not found on this product" })
  @ApiConflictResponse({ description: "New SKU already in use" })
  updateVariant(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(id, variantId, dto);
  }

  // DELETE /products/:id/variants/:variantId
  // Soft-deactivates the variant (isActive: false).
  // Full removal is blocked because order items reference variants.
  @Delete(":id/variants/:variantId")
  @UseGuards(JwtAuthGuard, RolesGuard, ProductOwnerGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Deactivate a variant",
    description:
      "Sets isActive=false. Does not hard-delete because order history references variants. The variant will no longer appear in listings.",
  })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiParam({ name: "variantId", description: "Variant cuid" })
  @ApiNoContentResponse({ description: "Variant deactivated" })
  @ApiNotFoundResponse({ description: "Variant not found on this product" })
  async deactivateVariant(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
  ): Promise<void> {
    await this.productsService.deactivateVariant(id, variantId);
  }

  // ─── IMAGE ROUTES ─────────────────────────────────────────────────────────

  // POST /products/:id/images/upload-url
  // Creates a presigned upload URL for direct S3/R2 upload.
  @Post(":id/images/upload-url")
  @UseGuards(JwtAuthGuard, RolesGuard, ProductOwnerGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create a presigned upload URL for a product image",
    description:
      "Creates a temporary upload URL for direct browser-to-storage uploads. Upload the file first, then confirm it with POST /products/:id/images/confirm.",
  })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiOkResponse({ description: "Presigned upload URL and object key" })
  @ApiNotFoundResponse({ description: "Product or variant not found" })
  createImageUploadUrl(@Param("id") id: string, @Body() dto: CreateProductImageUploadUrlDto) {
    return this.productsService.createImageUploadUrl(id, dto);
  }

  // POST /products/:id/images/confirm
  // Confirms the upload and creates the ProductImage DB record.
  @Post(":id/images/confirm")
  @UseGuards(JwtAuthGuard, RolesGuard, ProductOwnerGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Confirm product image upload",
    description:
      "Verifies the uploaded object exists in storage and creates the ProductImage database record.",
  })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiCreatedResponse({ description: "Product image created" })
  @ApiNotFoundResponse({ description: "Product, variant, or uploaded object not found" })
  confirmImageUpload(@Param("id") id: string, @Body() dto: ConfirmProductImageDto) {
    return this.productsService.confirmImageUpload(id, dto);
  }

  // DELETE /products/:id/images/:imageId
  @Delete(":id/images/:imageId")
  @UseGuards(JwtAuthGuard, RolesGuard, ProductOwnerGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Remove a product image",
    description: "Deletes both the ProductImage database record and the underlying storage object.",
  })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiParam({ name: "imageId", description: "Image cuid" })
  @ApiNoContentResponse({ description: "Image removed" })
  @ApiNotFoundResponse({ description: "Image not found on this product" })
  async removeImage(@Param("id") id: string, @Param("imageId") imageId: string): Promise<void> {
    await this.productsService.removeImage(id, imageId);
  }

  @Patch(":id/images/reorder")
  @UseGuards(JwtAuthGuard, RolesGuard, ProductOwnerGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Reorder product images" })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiOkResponse({ description: "Images reordered" })
  reorderImages(@Param("id") id: string, @Body() dto: ReorderProductImagesDto) {
    return this.productsService.reorderImages(id, dto);
  }
  // ─── CATEGORY ROUTES ──────────────────────────────────────────────────────

  // PUT /products/:id/categories
  // Replaces the full category set atomically.
  // PUT semantics are correct here — you send the desired end-state, not a patch.
  @Put(":id/categories")
  @UseGuards(JwtAuthGuard, RolesGuard, ProductOwnerGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Replace all categories for a product",
    description:
      "Atomically replaces the full category set. Send [] to remove all categories. This is a PUT — send the complete desired list, not a delta.",
  })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiOkResponse({ description: "Product with updated category assignments" })
  @ApiNotFoundResponse({ description: "Product or one or more categories not found" })
  setCategories(@Param("id") id: string, @Body() dto: SetCategoriesDto) {
    return this.productsService.setCategories(id, dto);
  }
}
