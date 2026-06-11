import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { NotificationsService } from "./notifications.service";
import { UpdatePreferenceDto } from "./dto/update-preference.dto";
import { DeliveryQueryDto } from "./dto/delivery-query.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types/auth.types";

@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── Preferences — static routes first ──────────────────────────

  @Get("preferences")
  @ApiOperation({ summary: "Get all notification preferences for current user" })
  getPreferences(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.getPreferences(req.user.id);
  }

  @Patch("preferences")
  @ApiOperation({ summary: "Enable or disable a notification preference" })
  upsertPreference(@Req() req: AuthenticatedRequest, @Body() dto: UpdatePreferenceDto) {
    return this.notificationsService.upsertPreference(req.user.id, dto);
  }

  // ─── IN_APP Inbox — static routes before param routes ───────────

  @Get("unread-count")
  @ApiOperation({ summary: "Get unread IN_APP notification count" })
  getUnreadCount(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  @Patch("read-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Mark all IN_APP notifications as read" })
  markAllAsRead(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  @Get()
  @ApiOperation({ summary: "Get notification delivery history (IN_APP inbox)" })
  getDeliveries(@Req() req: AuthenticatedRequest, @Query() query: DeliveryQueryDto) {
    return this.notificationsService.getDeliveries(req.user.id, query);
  }

  // ─── Param routes last ───────────────────────────────────────────

  @Patch(":id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Mark a single notification as read" })
  markAsRead(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }
}
