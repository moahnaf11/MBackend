import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiOkResponse,
  ApiNoContentResponse,
} from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UpdateUserRolesDto } from "./dto/update-user-roles.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UserRole, UserStatus } from "../../../generated/prisma/enums";
import { OwnerOrAdminGuard } from "./guards/owner-or-admin.guard";
import { RolesGuard } from "./guards/roles.guard";
import { Roles } from "./guards/roles.decorator";
import { UpdateUserEmailDto } from "./dto/update-user-email.dto";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── GET /users ───────────────────────────────────────────────────────────
  // Admin only — list all users with optional status filter and pagination

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "List all users (admin only)" })
  @ApiQuery({ name: "status", enum: UserStatus, required: false })
  @ApiQuery({ name: "page", type: Number, required: false, example: 1 })
  @ApiQuery({ name: "limit", type: Number, required: false, example: 20 })
  @ApiOkResponse({ description: "Paginated list of users" })
  findAll(
    @Query("status") status?: UserStatus,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.usersService.findAll({ status, page, limit });
  }

  // ─── GET /users/:id ───────────────────────────────────────────────────────
  // Owner or admin — get a specific user's data

  @Get(":id")
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @ApiOperation({ summary: "Get user by ID (owner or admin)" })
  @ApiParam({ name: "id", description: "User cuid" })
  @ApiOkResponse({ description: "User object (no password hash)" })
  findOne(@Param("id") id: string) {
    return this.usersService.findById(id);
  }

  // ─── PATCH /users/:id ─────────────────────────────────────────────────────
  // Owner or admin — update first name, last name, phone

  @Patch(":id")
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @ApiOperation({ summary: "Update user basic info (owner or admin)" })
  @ApiParam({ name: "id", description: "User cuid" })
  @ApiOkResponse({ description: "Updated user" })
  update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  // ─── DELETE /users/:id ────────────────────────────────────────────────────
  // Admin only — soft delete (sets status to DELETED, never removes the row)

  @Delete(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a user (admin only)" })
  @ApiParam({ name: "id", description: "User cuid" })
  @ApiNoContentResponse({ description: "User soft-deleted" })
  async remove(@Param("id") id: string) {
    await this.usersService.softDelete(id);
  }

  // ─── PATCH /users/:id/status ──────────────────────────────────────────────
  // Admin only — suspend or reactivate an account

  @Patch(":id/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Update user status — suspend or reactivate (admin only)" })
  @ApiParam({ name: "id", description: "User cuid" })
  @ApiOkResponse({ description: "User with updated status" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateUserStatusDto) {
    return this.usersService.updateStatus(id, dto);
  }

  // ─── PATCH /users/:id/roles ───────────────────────────────────────────────
  // Admin only — full replacement of roles array

  @Patch(":id/roles")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Replace user roles (admin only)" })
  @ApiParam({ name: "id", description: "User cuid" })
  @ApiOkResponse({ description: "User with updated roles" })
  updateRoles(@Param("id") id: string, @Body() dto: UpdateUserRolesDto) {
    return this.usersService.updateRoles(id, dto);
  }

  @Patch(":id/email")
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @ApiOperation({
    summary: "Request email change (owner or admin)",
  })
  @ApiParam({
    name: "id",
    description: "User cuid",
  })
  @ApiOkResponse({
    description: "Verification email sent to the new email address",
  })
  updateEmail(@Param("id") id: string, @Body() dto: UpdateUserEmailDto) {
    return this.usersService.requestEmailChange(id, dto);
  }

  @Get("email-change/verify")
  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @ApiOperation({
    summary: "Verify email token (owner or admin)",
  })
  verifyEmailChange(@Query("token") token: string) {
    return this.usersService.verifyEmailChange(token);
  }
}
