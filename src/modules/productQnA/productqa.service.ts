import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ProductStatus } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { ListQuestionsDto } from "./dto/list-questions.dto";
import { CreateQuestionDto } from "./dto/create-question.dto";
import { UpdateQuestionDto } from "./dto/update-question.dto";
import { SetVisibilityDto } from "./dto/set-visibility.dto";
import { CreateAnswerDto } from "./dto/create-answer.dto";
import { UpdateAnswerDto } from "./dto/update-answer.dto";

// ─── shared selects ─────────────────────────────────────────────────────────

// What we include when returning answers
const ANSWER_INCLUDE = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
    },
  },
  seller: {
    select: {
      id: true,
      storeName: true,
      slug: true,
    },
  },
} satisfies Prisma.ProductAnswerInclude;

// What we include when returning questions
const QUESTION_INCLUDE = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
    },
  },
  answers: {
    where: { isVisible: true },
    orderBy: [
      { isAccepted: "desc" as const }, // accepted answer always first
      { createdAt: "asc" as const },
    ],
    include: ANSWER_INCLUDE,
  },
} satisfies Prisma.ProductQuestionInclude;

@Injectable()
export class ProductQaService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── private helpers ──────────────────────────────────────────────────────

  private normalizeBody(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) throw new BadRequestException("Body cannot be empty.");
    return trimmed;
  }

  // Find an answer by ID. Always 404 on miss.
  private async findAnswer(id: string) {
    const answer = await this.prisma.productAnswer.findUnique({
      where: { id },
      include: {
        ...ANSWER_INCLUDE,
        question: {
          select: {
            id: true,
            productId: true,
            product: { select: { sellerId: true } },
          },
        },
      },
    });

    if (!answer) throw new NotFoundException("Answer not found.");
    return answer;
  }

  // Get the seller profile ID for a user. Returns null if not a seller.
  private async getSellerProfileId(userId: string): Promise<string | null> {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return seller?.id ?? null;
  }

  // ─── QUESTIONS ────────────────────────────────────────────────────────────

  async listByProduct(productId: string, query: ListQuestionsDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));

    // Verify product exists and is active
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { status: true },
    });

    if (!product || product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException("Product not found.");
    }

    const where: Prisma.ProductQuestionWhereInput = {
      productId,
      isVisible: true,
      // If answered=true, only return questions that have at least one visible answer
      ...(query.answered === true && {
        answers: { some: { isVisible: true } },
      }),
      ...(query.answered === false && {
        answers: { none: { isVisible: true } },
      }),
    };

    const [questions, total] = await this.prisma.$transaction([
      this.prisma.productQuestion.findMany({
        where,
        include: QUESTION_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productQuestion.count({ where }),
    ]);

    return {
      questions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const question = await this.prisma.productQuestion.findFirst({
      where: { id, isVisible: true },
      include: QUESTION_INCLUDE,
    });

    if (!question) throw new NotFoundException("Question not found.");
    return question;
  }

  async createQuestion(productId: string, userId: string, dto: CreateQuestionDto) {
    // Product must exist and be active — can't ask questions on drafts
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { status: true },
    });

    if (!product || product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException("Product not found.");
    }

    return this.prisma.productQuestion.create({
      data: {
        productId,
        userId,
        body: this.normalizeBody(dto.body),
        isVisible: true,
      },
      include: QUESTION_INCLUDE,
    });
  }

  async updateQuestion(id: string, userId: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.productQuestion.findUnique({
      where: { id },
      select: { userId: true },
    });

    // 404 whether it doesn't exist or belongs to someone else
    if (!question || question.userId !== userId) {
      throw new NotFoundException("Question not found.");
    }

    if (!dto.body) {
      throw new BadRequestException("Nothing to update.");
    }

    return this.prisma.productQuestion.update({
      where: { id },
      data: { body: this.normalizeBody(dto.body) },
      include: QUESTION_INCLUDE,
    });
  }

  async deleteQuestion(id: string, userId: string, isAdmin: boolean): Promise<void> {
    const question = await this.prisma.productQuestion.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!question) throw new NotFoundException("Question not found.");

    // Owners can delete their own questions. Admins can delete anything.
    if (!isAdmin && question.userId !== userId) {
      throw new NotFoundException("Question not found."); // 404 not 403
    }

    // Cascade delete removes all answers via schema onDelete: Cascade
    await this.prisma.productQuestion.delete({ where: { id } });
  }

  async setQuestionVisibility(id: string, dto: SetVisibilityDto) {
    const question = await this.prisma.productQuestion.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!question) throw new NotFoundException("Question not found.");

    return this.prisma.productQuestion.update({
      where: { id },
      data: { isVisible: dto.isVisible },
      include: QUESTION_INCLUDE,
    });
  }

  // ─── ANSWERS ─────────────────────────────────────────────────────────────

  async createAnswer(questionId: string, userId: string, dto: CreateAnswerDto) {
    const question = await this.prisma.productQuestion.findFirst({
      where: { id: questionId, isVisible: true },
      include: { product: { select: { sellerId: true } } },
    });

    if (!question) throw new NotFoundException("Question not found.");

    // Detect if the answering user is the product's seller.
    // If yes, attach sellerId so the "Seller" badge appears.
    // The client never sends sellerId — the backend resolves it.
    const sellerProfileId = await this.getSellerProfileId(userId);
    const isProductSeller =
      sellerProfileId !== null && question.product.sellerId === sellerProfileId;

    return this.prisma.productAnswer.create({
      data: {
        questionId,
        userId,
        sellerId: isProductSeller ? sellerProfileId : null,
        body: this.normalizeBody(dto.body),
        isVisible: true,
      },
      include: ANSWER_INCLUDE,
    });
  }

  async updateAnswer(id: string, userId: string, dto: UpdateAnswerDto) {
    const answer = await this.prisma.productAnswer.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!answer || answer.userId !== userId) {
      throw new NotFoundException("Answer not found.");
    }

    if (!dto.body) {
      throw new BadRequestException("Nothing to update.");
    }

    return this.prisma.productAnswer.update({
      where: { id },
      data: { body: this.normalizeBody(dto.body) },
      include: ANSWER_INCLUDE,
    });
  }

  async deleteAnswer(id: string, userId: string, isAdmin: boolean): Promise<void> {
    const answer = await this.prisma.productAnswer.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!answer) throw new NotFoundException("Answer not found.");

    if (!isAdmin && answer.userId !== userId) {
      throw new NotFoundException("Answer not found."); // 404 not 403
    }

    await this.prisma.productAnswer.delete({ where: { id } });
  }

  /**
   * Mark one answer as the accepted/official answer for a question.
   * Only the product's seller can do this.
   *
   * Uses a transaction to atomically:
   *   1. Clear isAccepted on all other answers for the question
   *   2. Set isAccepted on this answer
   *
   * This ensures only one accepted answer ever exists per question.
   */
  async acceptAnswer(answerId: string, userId: string) {
    const answer = await this.findAnswer(answerId);

    // Check the authenticated user is the product's seller
    const sellerProfileId = await this.getSellerProfileId(userId);

    if (!sellerProfileId || answer.question.product.sellerId !== sellerProfileId) {
      throw new ForbiddenException("Only the product seller can mark an accepted answer.");
    }

    await this.prisma.$transaction([
      // Clear accepted on all other answers for this question
      this.prisma.productAnswer.updateMany({
        where: {
          questionId: answer.question.id,
          id: { not: answerId },
        },
        data: { isAccepted: false },
      }),
      // Set accepted on this answer
      this.prisma.productAnswer.update({
        where: { id: answerId },
        data: { isAccepted: true },
      }),
    ]);

    // Return the full updated answer
    return this.prisma.productAnswer.findUnique({
      where: { id: answerId },
      include: ANSWER_INCLUDE,
    });
  }

  async setAnswerVisibility(id: string, dto: SetVisibilityDto) {
    const answer = await this.prisma.productAnswer.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!answer) throw new NotFoundException("Answer not found.");

    return this.prisma.productAnswer.update({
      where: { id },
      data: { isVisible: dto.isVisible },
      include: ANSWER_INCLUDE,
    });
  }
}
