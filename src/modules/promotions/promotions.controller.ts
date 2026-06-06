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
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
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
import { CreateCouponDto } from "./dto/create-coupon.dto";
import { CreatePromotionDto } from "./dto/create-promotion.dto";
import { ListPromotionsDto } from "./dto/list-promotions.dto";
import { UpdateCouponDto } from "./dto/update-coupon.dto";
import { UpdatePromotionDto } from "./dto/update-promotion.dto";
import { UpdatePromotionStatusDto } from "./dto/update-promotion-status.dto";
import { PromotionsService } from "./promotions.service";

@ApiTags("promotions")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("promotions")
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.SELLER)
  @ApiOperation({ summary: "List promotions visible to the authenticated admin/support/seller" })
  @ApiOkResponse({ description: "Paginated promotion list" })
  findAll(@Req() req: AuthenticatedRequest, @Query() query: ListPromotionsDto) {
    return this.promotionsService.findAll(req.user, query);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiOperation({ summary: "Create a promotion" })
  @ApiOkResponse({ description: "Created promotion" })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(req.user, dto);
  }

  @Patch("coupons/:id")
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiOperation({ summary: "Update a coupon" })
  @ApiParam({ name: "id", description: "Coupon cuid" })
  @ApiOkResponse({ description: "Updated coupon" })
  updateCoupon(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.promotionsService.updateCoupon(req.user, id, dto);
  }

  @Get(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.SELLER)
  @ApiOperation({ summary: "Get one promotion" })
  @ApiParam({ name: "id", description: "Promotion cuid" })
  @ApiOkResponse({ description: "Promotion detail" })
  findById(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.promotionsService.findByIdForUser(req.user, id);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiOperation({ summary: "Update a promotion" })
  @ApiParam({ name: "id", description: "Promotion cuid" })
  @ApiOkResponse({ description: "Updated promotion" })
  update(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.promotionsService.update(req.user, id, dto);
  }

  // DELETE /promotions/:id
  // Sellers can only delete their own DRAFT promotions.
  // Admins can delete any promotion regardless of status.
  @Delete(":id")
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiOperation({
    summary: "Delete a promotion",
    description:
      "Sellers can only delete their own DRAFT promotions. Admins can delete any promotion.",
  })
  @ApiParam({ name: "id", description: "Promotion cuid" })
  @ApiNoContentResponse({ description: "Promotion deleted" })
  @ApiNotFoundResponse({ description: "Promotion not found" })
  @ApiConflictResponse({ description: "Promotion has redemptions and cannot be deleted" })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: AuthenticatedRequest, @Param("id") id: string): Promise<void> {
    await this.promotionsService.remove(req.user, id);
  }

  @Patch(":id/status")
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiOperation({ summary: "Update a promotion status" })
  @ApiParam({ name: "id", description: "Promotion cuid" })
  @ApiOkResponse({ description: "Updated promotion" })
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdatePromotionStatusDto,
  ) {
    return this.promotionsService.updateStatus(req.user, id, dto);
  }

  @Get(":id/coupons")
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.SELLER)
  @ApiOperation({ summary: "List coupons for a promotion" })
  @ApiParam({ name: "id", description: "Promotion cuid" })
  @ApiOkResponse({ description: "Coupon list" })
  listCoupons(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.promotionsService.listCoupons(req.user, id);
  }

  @Post(":id/coupons")
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiOperation({ summary: "Create a coupon for a promotion" })
  @ApiParam({ name: "id", description: "Promotion cuid" })
  @ApiOkResponse({ description: "Created coupon" })
  createCoupon(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: CreateCouponDto,
  ) {
    return this.promotionsService.createCoupon(req.user, id, dto);
  }

  
  // DELETE /promotions/:id/coupons/:couponId
  // Must be declared before any potential /:id wildcard conflicts.
  @Delete(":id/coupons/:couponId")
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @ApiOperation({ summary: "Delete a coupon from a promotion" })
  @ApiParam({ name: "id", description: "Promotion cuid" })
  @ApiParam({ name: "couponId", description: "Coupon cuid" })
  @ApiNoContentResponse({ description: "Coupon deleted" })
  @ApiNotFoundResponse({ description: "Coupon not found" })
  @ApiConflictResponse({ description: "Coupon has been redeemed and cannot be deleted" })
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCoupon(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("couponId") couponId: string,
  ): Promise<void> {
    await this.promotionsService.removeCoupon(req.user, id, couponId);
  }
}
