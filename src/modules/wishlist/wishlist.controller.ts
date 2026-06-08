import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedRequest } from "../auth/types/auth.types";
import { WishlistService } from "./wishlist.service";
import { ListWishlistDto } from "./dto/list-wishlist.dto";


@ApiTags("wishlist")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("wishlist")
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  // GET /wishlist
  // Returns the authenticated user's paginated wishlist with full variant + product data.
  @Get()
  @ApiOperation({
    summary: "Get my wishlist",
    description: "Returns paginated wishlist items with variant, product, and seller info.",
  })
  @ApiOkResponse({ description: "Paginated wishlist" })
  findMine(@Req() req: AuthenticatedRequest, @Query() query: ListWishlistDto) {
    return this.wishlistService.findMine(req.user.id, query);
  }

  // GET /wishlist/check/:variantId
  // MUST be declared before /:variantId routes to avoid "check" matching as a variantId.
  // Lightweight endpoint for the frontend to know if a heart icon should be filled.
  @Get("check/:variantId")
  @ApiOperation({
    summary: "Check if a variant is in my wishlist",
    description:
      "Returns { wishlisted: boolean, addedAt: Date | null }. Use this to render filled/unfilled heart icons without fetching the full wishlist.",
  })
  @ApiParam({ name: "variantId", description: "Variant cuid" })
  @ApiOkResponse({ description: "Wishlist status for this variant" })
  checkItem(@Req() req: AuthenticatedRequest, @Param("variantId") variantId: string) {
    return this.wishlistService.checkItem(req.user.id, variantId);
  }

  // POST /wishlist/items/:variantId
  // Adds a variant to the wishlist. Idempotent-friendly — returns 409 if already added
  // so the frontend can handle it gracefully.
  @Post("items/:variantId")
  @ApiOperation({
    summary: "Add a variant to my wishlist",
    description: "Adds the variant to the wishlist. Returns 409 if already wishlisted.",
  })
  @ApiParam({ name: "variantId", description: "Variant cuid" })
  @ApiCreatedResponse({ description: "Wishlist item added" })
  @ApiConflictResponse({ description: "Already in wishlist" })
  @ApiNotFoundResponse({ description: "Variant not found or unavailable" })
  addItem(@Req() req: AuthenticatedRequest, @Param("variantId") variantId: string) {
    return this.wishlistService.addItem(req.user.id, variantId);
  }

  // DELETE /wishlist/items/:variantId
  // Removes a specific variant from the wishlist.
  @Delete("items/:variantId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a variant from my wishlist" })
  @ApiParam({ name: "variantId", description: "Variant cuid" })
  @ApiNoContentResponse({ description: "Item removed" })
  @ApiNotFoundResponse({ description: "Item not in wishlist" })
  async removeItem(
    @Req() req: AuthenticatedRequest,
    @Param("variantId") variantId: string,
  ): Promise<void> {
    await this.wishlistService.removeItem(req.user.id, variantId);
  }

  // DELETE /wishlist
  // Clears the entire wishlist. Always returns 204 even if already empty.
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Clear my wishlist",
    description: "Removes all items from the wishlist. Returns 204 even if already empty.",
  })
  @ApiNoContentResponse({ description: "Wishlist cleared" })
  async clearMine(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.wishlistService.clearMine(req.user.id);
  }
}
