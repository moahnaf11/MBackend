import {
  Body,
  Controller,
  Delete,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { SellerStatus, UserRole } from "../../../generated/prisma/enums";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types/auth.types";
import { Roles } from "../users/guards/roles.decorator";
import { RolesGuard } from "../users/guards/roles.guard";
import { ApplySellerDto } from "./dto/apply-seller.dto";
import { ConfirmSellerBannerDto } from "./dto/confirm-seller-banner.dto";
import { ConfirmSellerDocumentDto } from "./dto/confirm-seller-document.dto";
import { ConfirmSellerLogoDto } from "./dto/confirm-seller-logo.dto";
import { CreateSellerBannerUploadUrlDto } from "./dto/create-seller-banner-upload-url.dto";
import { CreateSellerDocumentUploadUrlDto } from "./dto/create-seller-document-upload-url.dto";
import { CreateSellerLogoUploadUrlDto } from "./dto/create-seller-logo-upload-url.dto";
import { UpdateSellerProfileDto } from "./dto/update-seller-profile.dto";
import { UpdateSellerStatusDto } from "./dto/update-seller-status.dto";
import { SellerProfileService } from "./seller-profile.service";

@ApiTags("seller-profile")
@Controller("seller-profile")
export class SellerProfileController {
  constructor(private readonly sellerProfileService: SellerProfileService) {}

  @Get("stores/:slug")
  @ApiOperation({ summary: "Get a public active seller store by slug" })
  @ApiParam({ name: "slug", description: "Seller store slug" })
  @ApiOkResponse({ description: "Public seller store profile" })
  findPublicBySlug(@Param("slug") slug: string) {
    return this.sellerProfileService.findPublicBySlug(slug);
  }

  @Post("apply")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Apply to become a seller" })
  @ApiOkResponse({ description: "Pending seller profile" })
  apply(@Req() req: AuthenticatedRequest, @Body() dto: ApplySellerDto) {
    return this.sellerProfileService.apply(req.user.id, dto);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the authenticated user's seller profile" })
  @ApiOkResponse({ description: "Seller profile for current user" })
  findMine(@Req() req: AuthenticatedRequest) {
    return this.sellerProfileService.findMine(req.user.id);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update the authenticated user's seller profile" })
  @ApiOkResponse({ description: "Updated seller profile" })
  updateMine(@Req() req: AuthenticatedRequest, @Body() dto: UpdateSellerProfileDto) {
    return this.sellerProfileService.updateMine(req.user.id, dto);
  }

  @Post("me/logo/upload-url")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a presigned upload URL for the seller store logo" })
  @ApiOkResponse({ description: "Presigned upload URL and object key" })
  createMyLogoUploadUrl(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSellerLogoUploadUrlDto,
  ) {
    return this.sellerProfileService.createLogoUploadUrl(req.user.id, dto);
  }

  @Patch("me/logo/confirm")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Confirm seller logo upload and save it to the profile" })
  @ApiOkResponse({ description: "Seller profile with updated logo" })
  confirmMyLogoUpload(@Req() req: AuthenticatedRequest, @Body() dto: ConfirmSellerLogoDto) {
    return this.sellerProfileService.confirmLogoUpload(req.user.id, dto);
  }

  @Delete("me/logo")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Remove the authenticated seller's store logo" })
  @ApiOkResponse({ description: "Seller profile with logo removed" })
  deleteMyLogo(@Req() req: AuthenticatedRequest) {
    return this.sellerProfileService.deleteLogo(req.user.id);
  }

  @Post("me/banner/upload-url")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a presigned upload URL for the seller store banner" })
  @ApiOkResponse({ description: "Presigned upload URL and object key" })
  createMyBannerUploadUrl(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSellerBannerUploadUrlDto,
  ) {
    return this.sellerProfileService.createBannerUploadUrl(req.user.id, dto);
  }

  @Patch("me/banner/confirm")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Confirm seller banner upload and save it to the profile" })
  @ApiOkResponse({ description: "Seller profile with updated banner" })
  confirmMyBannerUpload(@Req() req: AuthenticatedRequest, @Body() dto: ConfirmSellerBannerDto) {
    return this.sellerProfileService.confirmBannerUpload(req.user.id, dto);
  }

  @Delete("me/banner")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Remove the authenticated seller's store banner" })
  @ApiOkResponse({ description: "Seller profile with banner removed" })
  deleteMyBanner(@Req() req: AuthenticatedRequest) {
    return this.sellerProfileService.deleteBanner(req.user.id);
  }

  @Post("me/documents/upload-url")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a presigned upload URL for a seller verification document" })
  @ApiOkResponse({ description: "Presigned upload URL and object key" })
  createMyDocumentUploadUrl(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSellerDocumentUploadUrlDto,
  ) {
    return this.sellerProfileService.createDocumentUploadUrl(req.user.id, dto);
  }

  @Patch("me/documents/confirm")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Confirm seller verification document upload" })
  @ApiOkResponse({ description: "Created seller verification document" })
  confirmMyDocumentUpload(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ConfirmSellerDocumentDto,
  ) {
    return this.sellerProfileService.confirmDocumentUpload(req.user.id, dto);
  }

  @Get("me/documents")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List authenticated seller's verification documents" })
  @ApiOkResponse({ description: "Seller verification documents" })
  listMyDocuments(@Req() req: AuthenticatedRequest) {
    return this.sellerProfileService.listMineDocuments(req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List seller profiles (admin/support)" })
  @ApiQuery({ name: "status", enum: SellerStatus, required: false })
  @ApiQuery({ name: "page", type: Number, required: false, example: 1 })
  @ApiQuery({ name: "limit", type: Number, required: false, example: 20 })
  @ApiOkResponse({ description: "Paginated seller profile list" })
  findAll(
    @Query("status") status?: SellerStatus,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.sellerProfileService.findAll({ status, page, limit });
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get a seller profile by ID (admin/support)" })
  @ApiParam({ name: "id", description: "Seller profile cuid" })
  @ApiOkResponse({ description: "Seller profile" })
  findById(@Param("id") id: string) {
    return this.sellerProfileService.findById(id);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a seller profile by ID (admin)" })
  @ApiParam({ name: "id", description: "Seller profile cuid" })
  @ApiOkResponse({ description: "Updated seller profile" })
  updateById(@Param("id") id: string, @Body() dto: UpdateSellerProfileDto) {
    return this.sellerProfileService.updateById(id, dto);
  }

  @Patch(":id/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Approve, suspend, or close a seller profile (admin)" })
  @ApiParam({ name: "id", description: "Seller profile cuid" })
  @ApiOkResponse({ description: "Seller profile with updated status" })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateSellerStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sellerProfileService.updateStatus(id, dto, req.user.id);
  }
}
