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
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiCreatedResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AddressesService } from "./addresses.service";
import { CreateAddressDto } from "./dto/create-address.dto";
import { UpdateAddressDto } from "./dto/update-address.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OwnerOrAdminGuard } from "../users/guards/owner-or-admin.guard";

// All routes in this controller are nested under /users/:userId
// The :userId param is what OwnerOrAdminGuard reads to check ownership.
@ApiTags("addresses")
@ApiBearerAuth()
@Controller("users/:userId/addresses")
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  // ─── GET /users/:userId/addresses ─────────────────────────────────────────
  // Returns all saved addresses for a user, default address first.

  @Get()
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @ApiOperation({ summary: "List all addresses for a user" })
  @ApiParam({ name: "userId", description: "User cuid" })
  @ApiOkResponse({ description: "Array of addresses, default address first" })
  findAll(@Param("userId") userId: string) {
    return this.addressesService.findAll(userId);
  }

  // ─── GET /users/:userId/addresses/default ─────────────────────────────────
  // IMPORTANT: this MUST be declared before /:addressId.
  // NestJS matches routes top-to-bottom. If /:addressId came first,
  // the string "default" would be matched as an address ID and return 404.

  @Get("default")
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @ApiOperation({
    summary: "Get the default address",
    description:
      "Returns the address with isDefault=true. Used during checkout to pre-fill the delivery form. Returns 404 if no default is set.",
  })
  @ApiParam({ name: "userId", description: "User cuid" })
  @ApiOkResponse({ description: "The default address" })
  @ApiNotFoundResponse({ description: "No default address found" })
  findDefault(@Param("userId") userId: string) {
    return this.addressesService.findDefault(userId);
  }

  // ─── GET /users/:userId/addresses/:addressId ───────────────────────────────

  @Get(":addressId")
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @ApiOperation({ summary: "Get a single address by ID" })
  @ApiParam({ name: "userId", description: "User cuid" })
  @ApiParam({ name: "addressId", description: "Address cuid" })
  @ApiOkResponse({ description: "The requested address" })
  @ApiNotFoundResponse({ description: "Address not found or does not belong to this user" })
  findOne(@Param("userId") userId: string, @Param("addressId") addressId: string) {
    return this.addressesService.findOne(userId, addressId);
  }

  // ─── POST /users/:userId/addresses ────────────────────────────────────────
  // Creates a new address. If isDefault=true (or first address), clears
  // the default flag on all other addresses first.

  @Post()
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @ApiOperation({
    summary: "Add a new address",
    description:
      "Creates a new address for the user. If isDefault is true, or this is the first address, all other addresses will have their default flag cleared.",
  })
  @ApiParam({ name: "userId", description: "User cuid" })
  @ApiCreatedResponse({ description: "The created address" })
  create(@Param("userId") userId: string, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(userId, dto);
  }

  // ─── PATCH /users/:userId/addresses/:addressId ────────────────────────────
  // Updates any fields on an existing address. All fields are optional —
  // only send what you want to change.

  @Patch(":addressId")
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @ApiOperation({
    summary: "Update an address",
    description: "All fields are optional — only send the fields you want to change.",
  })
  @ApiParam({ name: "userId", description: "User cuid" })
  @ApiParam({ name: "addressId", description: "Address cuid" })
  @ApiOkResponse({ description: "The updated address" })
  @ApiNotFoundResponse({ description: "Address not found" })
  update(
    @Param("userId") userId: string,
    @Param("addressId") addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(userId, addressId, dto);
  }

  // ─── PATCH /users/:userId/addresses/:addressId/set-default ────────────────
  // Dedicated endpoint for changing the default address.
  // Uses a database transaction — both the "clear all" and "set one"
  // writes happen atomically so no broken state is ever possible.

  @Patch(":addressId/set-default")
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @ApiOperation({
    summary: "Set an address as the default",
    description:
      "Atomically clears the default flag on all other addresses and sets it on this one. Uses a database transaction.",
  })
  @ApiParam({ name: "userId", description: "User cuid" })
  @ApiParam({ name: "addressId", description: "Address cuid" })
  @ApiOkResponse({ description: "The address that is now the default" })
  @ApiNotFoundResponse({ description: "Address not found" })
  setDefault(@Param("userId") userId: string, @Param("addressId") addressId: string) {
    return this.addressesService.setDefault(userId, addressId);
  }

  // ─── DELETE /users/:userId/addresses/:addressId ───────────────────────────
  // Hard deletes the address. If it was the default, the most recently
  // created remaining address is automatically promoted to default.

  @Delete(":addressId")
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete an address",
    description:
      "Permanently removes the address. If it was the default, the most recently created remaining address is automatically promoted to default.",
  })
  @ApiParam({ name: "userId", description: "User cuid" })
  @ApiParam({ name: "addressId", description: "Address cuid" })
  @ApiNoContentResponse({ description: "Address deleted" })
  @ApiNotFoundResponse({ description: "Address not found" })
  async remove(
    @Param("userId") userId: string,
    @Param("addressId") addressId: string,
  ): Promise<void> {
    await this.addressesService.remove(userId, addressId);
  }
}
