import {
  Body,
  Controller,
  Get,
  Param,
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
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "../../../generated/prisma/enums";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types/auth.types";
import { Roles } from "../users/guards/roles.decorator";
import { RolesGuard } from "../users/guards/roles.guard";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { ListInventoryReservationsDto } from "./dto/list-inventory-reservations.dto";
import { UpdateWarehouseDto } from "./dto/update-warehouse.dto";
import { UpsertInventoryItemDto } from "./dto/upsert-inventory-item.dto";
import { InventoryService } from "./inventory.service";

@ApiTags("inventory")
@ApiBearerAuth()
@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post("warehouses")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Create a warehouse (admin only)" })
  @ApiOkResponse({ description: "Created warehouse" })
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(dto);
  }

  @Get("warehouses")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "List warehouses (admin only)" })
  @ApiOkResponse({ description: "Warehouse list" })
  findWarehouses() {
    return this.inventoryService.findWarehouses();
  }

  @Patch("warehouses/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Update a warehouse (admin only)" })
  @ApiParam({ name: "id", description: "Warehouse cuid" })
  @ApiOkResponse({ description: "Updated warehouse" })
  updateWarehouse(@Param("id") id: string, @Body() dto: UpdateWarehouseDto) {
    return this.inventoryService.updateWarehouse(id, dto);
  }

  @Get("products/:id/variants/:variantId/inventory")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiOperation({ summary: "Get stock levels for a variant across warehouses" })
  @ApiParam({ name: "id", description: "Product cuid" })
  @ApiParam({ name: "variantId", description: "Variant cuid" })
  @ApiOkResponse({ description: "Variant inventory by warehouse" })
  getVariantInventory(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.getVariantInventory(id, variantId, req.user);
  }

  @Patch("inventory/:variantId/:warehouseId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiOperation({ summary: "Set stock level for a variant in a warehouse" })
  @ApiParam({ name: "variantId", description: "Variant cuid" })
  @ApiParam({ name: "warehouseId", description: "Warehouse cuid" })
  @ApiOkResponse({ description: "Updated inventory item" })
  upsertInventoryItem(
    @Param("variantId") variantId: string,
    @Param("warehouseId") warehouseId: string,
    @Body() dto: UpsertInventoryItemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.upsertInventoryItem(variantId, warehouseId, dto, req.user);
  }

  @Get("inventory/reservations")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: "List inventory reservations (admin/support)" })
  @ApiOkResponse({ description: "Inventory reservations" })
  listReservations(@Query() query: ListInventoryReservationsDto) {
    return this.inventoryService.listReservations(query);
  }

  @Post("inventory/reservations/expire")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Expire abandoned active reservations manually (admin only)" })
  @ApiOkResponse({ description: "Expiration count" })
  expireReservations() {
    return this.inventoryService.expireReservations();
  }
}
