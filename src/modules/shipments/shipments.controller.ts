import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../users/guards/roles.guard";
import { Roles } from "../users/guards/roles.decorator";
import { UserRole } from "../../../generated/prisma/enums";
import { AuthenticatedRequest } from "../auth/types/auth.types";

import { ShipmentsService } from "./shipments.service";
import { CreateShipmentDto } from "./dto/create-shipment.dto";
import { UpdateShipmentStatusDto } from "./dto/update-shipment-status.dto";

@ApiTags("shipments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("shipments")
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  // ─────────────────────────────────────────────
  // CREATE SHIPMENT (SELLER ONLY)
  // ─────────────────────────────────────────────
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiOperation({ summary: "Create a shipment for an order" })
  createShipment(@Req() req: AuthenticatedRequest, @Body() dto: CreateShipmentDto) {
    return this.shipmentsService.createShipment(req.user.id, dto);
  }
  @Get("order/:orderId")
  @ApiOperation({ summary: "Get shipments for a specific order (buyer view)" })
  @UseGuards(JwtAuthGuard)
  async getOrderShipments(@Param("orderId") orderId: string, @Req() req: AuthenticatedRequest) {
    return this.shipmentsService.findByOrderId(orderId, req.user.id);
  }

  // ─────────────────────────────────────────────
  // SELLER SHIPMENTS
  // ─────────────────────────────────────────────
  @Get("seller/me")
  @UseGuards(RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiOperation({ summary: "Get all shipments for seller" })
  getSellerShipments(@Req() req: AuthenticatedRequest) {
    return this.shipmentsService.findSellerShipments(req.user.id);
  }
  // ─────────────────────────────────────────────
  // GET SHIPMENT BY ID
  // ─────────────────────────────────────────────
  @Get(":id")
  @ApiOperation({ summary: "Get shipment by id" })
  @ApiParam({ name: "id", description: "Shipment id" })
  getShipment(@Param("id") id: string) {
    return this.shipmentsService.findById(id);
  }

  // ─────────────────────────────────────────────
  // UPDATE SHIPMENT STATUS (ADMIN / SUPPORT ONLY)
  // ─────────────────────────────────────────────
  @Patch(":id/status")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: "Update shipment status" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateShipmentStatusDto) {
    return this.shipmentsService.updateStatus(id, dto);
  }
}
