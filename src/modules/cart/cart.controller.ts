import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types/auth.types";
import { CartService } from "./cart.service";
import { AddCartItemDto } from "./dto/add-cart-item.dto";
import { ApplyCartCouponDto } from "./dto/apply-cart-coupon.dto";
import { UpdateCartItemDto } from "./dto/update-cart-item.dto";

@ApiTags("cart")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("cart")
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get("me")
  @ApiOperation({ summary: "Get the authenticated user's active cart" })
  @ApiOkResponse({ description: "The active cart with items, product details, and totals" })
  findMine(@Req() req: AuthenticatedRequest) {
    return this.cartService.findMine(req.user.id);
  }

  @Post("items")
  @ApiOperation({ summary: "Add a product variant to the authenticated user's cart" })
  @ApiOkResponse({ description: "Updated active cart" })
  addItem(@Req() req: AuthenticatedRequest, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(req.user.id, dto);
  }

  @Patch("items/:itemId")
  @ApiOperation({ summary: "Update a cart item's quantity" })
  @ApiParam({ name: "itemId", description: "Cart item cuid" })
  @ApiOkResponse({ description: "Updated active cart" })
  updateItem(
    @Req() req: AuthenticatedRequest,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(req.user.id, itemId, dto);
  }

  @Delete("items/:itemId")
  @ApiOperation({ summary: "Remove an item from the authenticated user's cart" })
  @ApiParam({ name: "itemId", description: "Cart item cuid" })
  @ApiOkResponse({ description: "Updated active cart" })
  removeItem(@Req() req: AuthenticatedRequest, @Param("itemId") itemId: string) {
    return this.cartService.removeItem(req.user.id, itemId);
  }

  @Delete("items")
  @ApiOperation({ summary: "Clear all items from the authenticated user's cart" })
  @ApiOkResponse({ description: "Empty active cart" })
  clearMine(@Req() req: AuthenticatedRequest) {
    return this.cartService.clearMine(req.user.id);
  }

  @Post("coupon")
  @ApiOperation({ summary: "Apply a coupon code to the authenticated user's cart" })
  @ApiOkResponse({ description: "Updated active cart" })
  applyCoupon(@Req() req: AuthenticatedRequest, @Body() dto: ApplyCartCouponDto) {
    return this.cartService.applyCoupon(req.user.id, dto);
  }

  @Delete("coupon")
  @ApiOperation({ summary: "Remove the coupon code from the authenticated user's cart" })
  @ApiOkResponse({ description: "Updated active cart" })
  removeCoupon(@Req() req: AuthenticatedRequest) {
    return this.cartService.removeCoupon(req.user.id);
  }
}
