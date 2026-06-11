import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../../../generated/prisma/enums";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types/auth.types";
import { Roles } from "../users/guards/roles.decorator";
import { RolesGuard } from "../users/guards/roles.guard";
import { CreateFraudFlagDto } from "./dto/create-fraud-flag.dto";
import { ListFraudFlagsDto } from "./dto/list-fraud-flags.dto";
import { UpdateFraudFlagStatusDto } from "./dto/update-fraud-flag-status.dto";
import { FraudFlagsService } from "./fraud-flags.service";

@ApiTags("fraud-flags")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPPORT)
@Controller("fraud-flags")
export class FraudFlagsController {
  constructor(private readonly fraudFlagsService: FraudFlagsService) {}

  @Post()
  @ApiOperation({ summary: "Create a fraud flag (admin/support)" })
  @ApiCreatedResponse({ description: "Created fraud flag" })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateFraudFlagDto) {
    return this.fraudFlagsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "List all fraud flags with optional filters (admin/support)" })
  @ApiOkResponse({ description: "Paginated fraud flag list" })
  findAll(@Query() query: ListFraudFlagsDto) {
    return this.fraudFlagsService.findAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one fraud flag by ID (admin/support)" })
  @ApiParam({ name: "id", description: "Fraud flag cuid" })
  @ApiOkResponse({ description: "Fraud flag detail" })
  findById(@Param("id") id: string) {
    return this.fraudFlagsService.findById(id);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Update fraud flag status (admin/support)" })
  @ApiParam({ name: "id", description: "Fraud flag cuid" })
  @ApiOkResponse({ description: "Updated fraud flag" })
  updateStatus(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateFraudFlagStatusDto,
  ) {
    return this.fraudFlagsService.updateStatus(id, req.user.id, dto);
  }
}
