import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/types/auth.types";
import { ProductQaService } from "./productqa.service";
import { ListQuestionsDto } from "./dto/list-questions.dto";
import { CreateQuestionDto } from "./dto/create-question.dto";

// Routes scoped to a specific product:
//   GET  /products/:productId/questions         — public
//   POST /products/:productId/questions         — authenticated

@ApiTags("product-qa")
@Controller("products/:productId/questions")
export class ProductQuestionsController {
  constructor(private readonly productQaService: ProductQaService) {}

  // GET /products/:productId/questions
  // Public — no auth needed. Returns visible questions + their visible answers.
  @Get()
  @ApiOperation({
    summary: "List questions for a product (public)",
    description:
      "Returns paginated visible questions with their visible answers nested inside. " +
      "Use ?answered=true to show only questions that have at least one answer.",
  })
  @ApiParam({ name: "productId", description: "Product cuid" })
  @ApiOkResponse({ description: "Paginated questions with nested answers" })
  @ApiNotFoundResponse({ description: "Product not found or not active" })
  listByProduct(@Param("productId") productId: string, @Query() query: ListQuestionsDto) {
    return this.productQaService.listByProduct(productId, query);
  }

  // POST /products/:productId/questions
  // Any authenticated user can ask a question — no purchase required.
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Ask a question about a product",
    description:
      "Any logged-in user can post a question. No purchase required. " + "Product must be ACTIVE.",
  })
  @ApiParam({ name: "productId", description: "Product cuid" })
  @ApiCreatedResponse({ description: "The created question" })
  @ApiNotFoundResponse({ description: "Product not found or not active" })
  createQuestion(
    @Param("productId") productId: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.productQaService.createQuestion(productId, req.user.id, dto);
  }
}
