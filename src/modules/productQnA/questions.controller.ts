import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  HttpStatus,
  HttpCode,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
} from "@nestjs/swagger";

import { UpdateQuestionDto } from "./dto/update-question.dto";
import { SetVisibilityDto } from "./dto/set-visibility.dto";
import { CreateAnswerDto } from "./dto/create-answer.dto";
import { UpdateAnswerDto } from "./dto/update-answer.dto";
import { ProductQaService } from "./productqa.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedRequest } from "../auth/types/auth.types";
import { UserRole } from "../../../generated/prisma/enums";
import { RolesGuard } from "../users/guards/roles.guard";
import { Roles } from "../users/guards/roles.decorator";

@ApiTags("product-qa")
@Controller()
export class QuestionsController {
  constructor(private readonly productQaService: ProductQaService) {}

  // ─── Question routes ──────────────────────────────────────────────────────

  // GET /questions/:id
  // Public — returns a single visible question with its visible answers.
  @Get("questions/:id")
  @ApiOperation({
    summary: "Get a single question",
    description: "Returns a visible question with its visible answers nested inside.",
  })
  @ApiParam({ name: "id", description: "Question cuid" })
  @ApiOkResponse({ description: "The question with nested answers" })
  @ApiNotFoundResponse({ description: "Question not found or not visible" })
  findOne(@Param("id") id: string) {
    return this.productQaService.findById(id);
  }

  // PATCH /questions/:id/visibility
  // Admin only — soft-hide or reveal a question.
  @Patch("questions/:id/visibility")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Set question visibility (admin)",
    description:
      "Soft moderation — hide or reveal a question. " +
      "Hidden questions don't appear in the product page list.",
  })
  @ApiParam({ name: "id", description: "Question cuid" })
  @ApiOkResponse({ description: "The updated question" })
  @ApiNotFoundResponse({ description: "Question not found" })
  setQuestionVisibility(@Param("id") id: string, @Body() dto: SetVisibilityDto) {
    return this.productQaService.setQuestionVisibility(id, dto);
  }

  // PATCH /questions/:id
  // Owner only — edits the question body.
  @Patch("questions/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Edit your question",
    description: "Only the person who asked the question can edit it. Body field only.",
  })
  @ApiParam({ name: "id", description: "Question cuid" })
  @ApiOkResponse({ description: "The updated question" })
  @ApiNotFoundResponse({ description: "Question not found" })
  updateQuestion(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.productQaService.updateQuestion(id, req.user.id, dto);
  }

  // DELETE /questions/:id
  // Owner or admin — cascade-deletes all answers too.
  @Delete("questions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Delete your question",
    description: "Owner can delete their own questions. Admins can delete anything.",
  })
  @ApiParam({ name: "id", description: "Question cuid" })
  @ApiNoContentResponse({ description: "Question deleted" })
  @ApiNotFoundResponse({ description: "Question not found" })
  async deleteQuestion(@Param("id") id: string, @Request() req: AuthenticatedRequest) {
    await this.productQaService.deleteQuestion(
      id,
      req.user.id,
      req.user.roles?.includes(UserRole.ADMIN) ?? false,
    );
  }

  // ─── Answer routes ────────────────────────────────────────────────────────

  // POST /questions/:id/answers
  // Any authenticated user can answer. Seller badge auto-detected by service.
  @Post("questions/:id/answers")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Answer a question",
    description:
      "Any logged-in user can answer. If the answerer is the product's seller, " +
      'the "Seller" badge is automatically attached by the backend. ' +
      "The client does not send sellerId.",
  })
  @ApiParam({ name: "id", description: "Question cuid" })
  @ApiCreatedResponse({ description: "The created answer" })
  @ApiNotFoundResponse({ description: "Question not found or not visible" })
  createAnswer(
    @Param("id") questionId: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateAnswerDto,
  ) {
    return this.productQaService.createAnswer(questionId, req.user.id, dto);
  }

  // PATCH /answers/:id/accept
  // Product seller only — marks this answer as the official accepted answer.
  @Patch("answers/:id/accept")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Mark answer as accepted (product seller)",
    description:
      "Only the product's seller can accept an answer. " +
      "Sets isAccepted=true on this answer and clears it on all others for the same question. " +
      "One accepted answer per question, atomically.",
  })
  @ApiParam({ name: "id", description: "Answer cuid" })
  @ApiOkResponse({ description: "The accepted answer" })
  @ApiNotFoundResponse({ description: "Answer not found" })
  @ApiForbiddenResponse({ description: "Only the product seller can accept" })
  acceptAnswer(@Param("id") id: string, @Request() req: AuthenticatedRequest) {
    return this.productQaService.acceptAnswer(id, req.user.id);
  }

  // PATCH /answers/:id/visibility
  // Admin only — soft-hide or reveal an answer.
  @Patch("answers/:id/visibility")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Set answer visibility (admin)",
    description:
      "Soft moderation — hide or reveal an answer. " +
      "Hidden answers don't appear nested under the question.",
  })
  @ApiParam({ name: "id", description: "Answer cuid" })
  @ApiOkResponse({ description: "The updated answer" })
  @ApiNotFoundResponse({ description: "Answer not found" })
  setAnswerVisibility(@Param("id") id: string, @Body() dto: SetVisibilityDto) {
    return this.productQaService.setAnswerVisibility(id, dto);
  }

  // PATCH /answers/:id
  // Owner only — edits the answer body.
  @Patch("answers/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Edit your answer",
    description: "Only the person who wrote the answer can edit it. Body field only.",
  })
  @ApiParam({ name: "id", description: "Answer cuid" })
  @ApiOkResponse({ description: "The updated answer" })
  @ApiNotFoundResponse({ description: "Answer not found" })
  updateAnswer(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateAnswerDto,
  ) {
    return this.productQaService.updateAnswer(id, req.user.id, dto);
  }

  // DELETE /answers/:id
  // Owner or admin.
  @Delete("answers/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Delete your answer",
    description: "Owner can delete their own answers. Admins can delete anything.",
  })
  @ApiParam({ name: "id", description: "Answer cuid" })
  @ApiNoContentResponse({ description: "Answer deleted" })
  @ApiNotFoundResponse({ description: "Answer not found" })
  async deleteAnswer(@Param("id") id: string, @Request() req: AuthenticatedRequest) {
    await this.productQaService.deleteAnswer(
      id,
      req.user.id,
      req.user.roles?.includes(UserRole.ADMIN) ?? false,
    );
  }
}
