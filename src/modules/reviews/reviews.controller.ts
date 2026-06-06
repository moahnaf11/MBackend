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
  ApiNoContentResponse,
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
import { CreateReviewDto } from "./dto/create-review.dto";
import { ListReviewsDto } from "./dto/list-reviews.dto";
import { ModerateReviewDto } from "./dto/moderate-review.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";
import { ReviewsService } from "./reviews.service";

@ApiTags("reviews")
@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get("products/:productId")
  @ApiOperation({ summary: "List visible reviews for a product" })
  @ApiParam({ name: "productId", description: "Product cuid" })
  @ApiOkResponse({ description: "Paginated visible reviews with rating summary" })
  findPublicByProduct(@Param("productId") productId: string, @Query() query: ListReviewsDto) {
    return this.reviewsService.findPublicByProduct(productId, query);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the authenticated user's reviews" })
  @ApiOkResponse({ description: "Paginated review list" })
  findMine(@Req() req: AuthenticatedRequest, @Query() query: ListReviewsDto) {
    return this.reviewsService.findMine(req.user.id, query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a verified-purchase review" })
  @ApiOkResponse({ description: "Created review" })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(req.user.id, dto);
  }

  @Get("admin/all")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List all reviews, including hidden reviews (admin/support)" })
  @ApiOkResponse({ description: "Paginated review list" })
  findAll(@Query() query: ListReviewsDto) {
    return this.reviewsService.findAll(query);
  }

  @Patch("admin/:id/visibility")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Show or hide a review (admin/support)" })
  @ApiParam({ name: "id", description: "Review cuid" })
  @ApiOkResponse({ description: "Updated review" })
  moderate(@Param("id") id: string, @Body() dto: ModerateReviewDto) {
    return this.reviewsService.moderate(id, dto);
  }

  @Delete("admin/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Permanently delete a review (admin only)" })
  @ApiParam({ name: "id", description: "Review cuid" })
  @ApiNoContentResponse({ description: "Review deleted" })
  async remove(@Param("id") id: string): Promise<void> {
    await this.reviewsService.remove(id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one visible review" })
  @ApiParam({ name: "id", description: "Review cuid" })
  @ApiOkResponse({ description: "Review detail" })
  findPublicById(@Param("id") id: string) {
    return this.reviewsService.findPublicById(id);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update one of the authenticated user's reviews" })
  @ApiParam({ name: "id", description: "Review cuid" })
  @ApiOkResponse({ description: "Updated review" })
  updateMine(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.updateMine(req.user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete one of the authenticated user's reviews" })
  @ApiParam({ name: "id", description: "Review cuid" })
  @ApiNoContentResponse({ description: "Review deleted" })
  async removeMine(@Req() req: AuthenticatedRequest, @Param("id") id: string): Promise<void> {
    await this.reviewsService.removeMine(req.user.id, id);
  }
}
