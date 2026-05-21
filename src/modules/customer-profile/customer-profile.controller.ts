import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "../../../generated/prisma/enums";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types/auth.types";
import { Roles } from "../users/guards/roles.decorator";
import { RolesGuard } from "../users/guards/roles.guard";
import { CustomerProfileService } from "./customer-profile.service";
import { ConfirmCustomerAvatarDto } from "./dto/confirm-customer-avatar.dto";
import { CreateAvatarUploadUrlDto } from "./dto/create-avatar-upload-url.dto";
import { UpsertCustomerProfileDto } from "./dto/upsert-customer-profile.dto";

@ApiTags("customer-profile")
@ApiBearerAuth()
@Controller("customer-profile")
export class CustomerProfileController {
  constructor(private readonly customerProfileService: CustomerProfileService) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get the authenticated customer's profile" })
  @ApiOkResponse({ description: "Customer profile for the current user" })
  findMine(@Req() req: AuthenticatedRequest) {
    return this.customerProfileService.findMine(req.user.id);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Create or update the authenticated customer's profile" })
  @ApiOkResponse({ description: "Created or updated customer profile" })
  upsertMine(@Req() req: AuthenticatedRequest, @Body() dto: UpsertCustomerProfileDto) {
    return this.customerProfileService.upsertMine(req.user.id, dto);
  }

  @Post("me/avatar/upload-url")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Create a presigned upload URL for the customer's avatar" })
  @ApiOkResponse({ description: "Presigned upload URL and object key" })
  createMyAvatarUploadUrl(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateAvatarUploadUrlDto,
  ) {
    return this.customerProfileService.createAvatarUploadUrl(req.user.id, dto);
  }

  @Patch("me/avatar/confirm")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Confirm avatar upload and save it to the customer profile" })
  @ApiOkResponse({ description: "Customer profile with updated avatar" })
  confirmMyAvatarUpload(@Req() req: AuthenticatedRequest, @Body() dto: ConfirmCustomerAvatarDto) {
    return this.customerProfileService.confirmAvatarUpload(req.user.id, dto);
  }

  @Delete("me/avatar")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Remove the authenticated customer's avatar" })
  @ApiOkResponse({ description: "Customer profile with avatar removed" })
  deleteMyAvatar(@Req() req: AuthenticatedRequest) {
    return this.customerProfileService.deleteAvatar(req.user.id);
  }

  @Get("users/:userId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: "Get a customer profile by user ID (admin/support)" })
  @ApiParam({ name: "userId", description: "User cuid" })
  @ApiOkResponse({ description: "Customer profile for the requested user" })
  findByUserId(@Param("userId") userId: string) {
    return this.customerProfileService.findByUserId(userId);
  }

  @Patch("users/:userId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Create or update a customer profile by user ID (admin)" })
  @ApiParam({ name: "userId", description: "User cuid" })
  @ApiOkResponse({ description: "Created or updated customer profile" })
  upsertForUser(@Param("userId") userId: string, @Body() dto: UpsertCustomerProfileDto) {
    return this.customerProfileService.upsertForUser(userId, dto);
  }
}
