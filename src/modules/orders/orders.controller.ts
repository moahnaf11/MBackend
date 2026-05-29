import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
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
import { CreateOrderFromCartDto } from "./dto/create-order-from-cart.dto";
import { ListOrdersDto } from "./dto/list-orders.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { OrdersService } from "./orders.service";

@ApiTags("orders")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post("checkout")
  @ApiOperation({ summary: "Create a pending-payment order from the authenticated user's cart" })
  @ApiOkResponse({ description: "Created order" })
  createFromCart(@Req() req: AuthenticatedRequest, @Body() dto: CreateOrderFromCartDto) {
    return this.ordersService.createFromCart(req.user.id, dto);
  }

  @Get("me")
  @ApiOperation({ summary: "List the authenticated user's orders" })
  @ApiOkResponse({ description: "Paginated order list" })
  findMine(@Req() req: AuthenticatedRequest, @Query() query: ListOrdersDto) {
    return this.ordersService.findMine(req.user.id, query);
  }

  @Get("me/:id")
  @ApiOperation({ summary: "Get one order belonging to the authenticated user" })
  @ApiParam({ name: "id", description: "Order cuid" })
  @ApiOkResponse({ description: "Order detail" })
  findMineById(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.ordersService.findMineById(req.user.id, id);
  }

  @Post("me/:id/cancel")
  @ApiOperation({ summary: "Cancel one of the authenticated user's pending-payment orders" })
  @ApiParam({ name: "id", description: "Order cuid" })
  @ApiOkResponse({ description: "Cancelled order detail" })
  cancelMine(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.ordersService.cancelMine(req.user.id, id);
  }

  @Get("seller")
  @UseGuards(RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiOperation({ summary: "List orders containing the authenticated seller's items" })
  @ApiOkResponse({ description: "Paginated seller order list" })
  findSellerOrders(@Req() req: AuthenticatedRequest, @Query() query: ListOrdersDto) {
    return this.ordersService.findSellerOrders(req.user.id, query);
  }

  @Get("seller/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiOperation({ summary: "Get one order containing the authenticated seller's items" })
  @ApiParam({ name: "id", description: "Order cuid" })
  @ApiOkResponse({ description: "Seller order detail" })
  findSellerOrderById(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.ordersService.findSellerOrderById(req.user.id, id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: "List all orders (admin/support)" })
  @ApiOkResponse({ description: "Paginated order list" })
  findAll(@Query() query: ListOrdersDto) {
    return this.ordersService.findAll(query);
  }

  @Get(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: "Get one order by ID (admin/support)" })
  @ApiParam({ name: "id", description: "Order cuid" })
  @ApiOkResponse({ description: "Order detail" })
  findById(@Param("id") id: string) {
    return this.ordersService.findById(id);
  }

  @Patch(":id/status")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: "Update an order status (admin/support)" })
  @ApiParam({ name: "id", description: "Order cuid" })
  @ApiOkResponse({ description: "Updated order detail" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }
}
