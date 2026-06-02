import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../users/guards/roles.guard";
import { Roles } from "../users/guards/roles.decorator";
import { UserRole } from "../../../generated/prisma/enums";
import { AuthenticatedRequest } from "../auth/types/auth.types";

import { ReturnsService } from "./returns.service";
import { CreateReturnRequestDto } from "./dto/create-return-request.dto";
import { UpdateReturnStatusDto } from "./dto/update-return-request.dto";

@ApiTags("returns")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("returns")
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  // ───── CREATE RETURN ─────
  @Post("orders/:orderId")
  @ApiOperation({ summary: "Create return request for order" })
  create(
    @Req() req: AuthenticatedRequest,
    @Param("orderId") orderId: string,
    @Body() dto: CreateReturnRequestDto,
  ) {
    return this.returnsService.createReturn(req.user.id, orderId, dto);
  }

  // ───── CUSTOMER RETURNS ─────
  @Get("me")
  @ApiOperation({ summary: "Get my returns" })
  getMyReturns(@Req() req: AuthenticatedRequest) {
    return this.returnsService.findMyReturns(req.user.id);
  }

  @Get("me/:id")
  @ApiOperation({ summary: "Get single return" })
  getMyReturn(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.returnsService.findMyReturn(req.user.id, id);
  }

  // ───── ADMIN LIST ─────
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: "Get all returns (ADMIN/SUPPORT)" })
  findAll() {
    return this.returnsService.findAll();
  }

  // ───── ADMIN GET BY ID ─────
  @Get(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: "Get return by id (ADMIN/SUPPORT)" })
  findById(@Param("id") id: string) {
    return this.returnsService.findById(id);
  }

  // ───── UPDATE STATUS ─────
  @Patch(":id/status")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: "Update return status by id (ADMIN/SUPPORT)" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateReturnStatusDto) {
    return this.returnsService.updateStatus(id, dto);
  }
}
