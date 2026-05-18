import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UpdateUserRolesDto } from "./dto/update-user-roles.dto";
import { Prisma, UserStatus } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { UpdateUserEmailDto } from "./dto/update-user-email.dto";
import { EmailService } from "../email/email.service";
import { AuthService } from "../auth/auth.service";
import { EMAIL_VERIFICATION_TOKEN_TTL_SECONDS } from "../auth/auth.constants";

// Fields that are safe to return to clients.
// Never expose passwordHash, even as null.
const USER_SAFE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  roles: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type DevActionLink = {
  token: string;
  url: string;
  expiresAt: Date;
};
type GenericAuthMessage = {
  message: string;
  dev?: DevActionLink;
};

export type SafeUser = Prisma.UserGetPayload<{ select: typeof USER_SAFE_SELECT }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly authService: AuthService,
  ) {}

  // ─── list ────────────────────────────────────────────────────────────────

  async findAll(params: {
    status?: UserStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: SafeUser[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    if (params.status) where.status = params.status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SAFE_SELECT,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ─── single ──────────────────────────────────────────────────────────────

  async findById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SAFE_SELECT,
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  // ─── update basic info ────────────────────────────────────────────────────

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    // Ensure the user exists first so we throw 404 not a Prisma crash
    await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
      },
      select: USER_SAFE_SELECT,
    });
  }

  // ─── soft delete ─────────────────────────────────────────────────────────

  async softDelete(id: string): Promise<void> {
    await this.findById(id);

    await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.DELETED },
    });
  }

  // ─── status (suspend / reactivate) ───────────────────────────────────────

  async updateStatus(id: string, dto: UpdateUserStatusDto): Promise<SafeUser> {
    const user = await this.findById(id);

    // Guard: can't change status of a deleted account via this endpoint
    if (user.status === UserStatus.DELETED) {
      throw new ConflictException("Cannot change status of a deleted account");
    }

    // No-op if already in the desired state — return current user
    if (user.status === dto.status) return user;

    return this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
      select: USER_SAFE_SELECT,
    });
  }

  // ─── roles ────────────────────────────────────────────────────────────────

  async updateRoles(id: string, dto: UpdateUserRolesDto): Promise<SafeUser> {
    await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data: { roles: { set: dto.roles } },
      select: USER_SAFE_SELECT,
    });
  }

  // ─── email change (verify after) ───────────────────────────────────────

  async requestEmailChange(userId: string, dto: UpdateUserEmailDto): Promise<GenericAuthMessage> {
    const newEmail = dto.email.trim().toLowerCase();

    // Ensure email not already taken
    const existing = await this.prisma.user.findUnique({
      where: { email: newEmail },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("A user with this email already exists.");
    }

    const dev = await this.createEmailChangeVerificationToken(userId, newEmail);

    await this.emailService.sendEmailChangeVerificationEmail(newEmail, dev.url);

    return {
      message: "Email verification email sent to new email address",
      dev,
    };
  }

  async verifyEmailChange(token: string) {
    const tokenHash = this.authService.hashActionToken(token);

    // 1. Find valid token
    const record = await this.prisma.emailChangeToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!record) {
      throw new BadRequestException("Invalid or expired token");
    }

    // 2. Get user
    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // 3. Final update (THIS is the actual email change)
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          email: record.newEmail,
          emailVerifiedAt: new Date(),
        },
      }),

      this.prisma.emailChangeToken.update({
        where: { id: record.id },
        data: {
          usedAt: new Date(),
        },
      }),
    ]);

    return {
      message: "Email successfully updated",
    };
  }

  private async createEmailChangeVerificationToken(
    userId: string,
    newEmail: string,
  ): Promise<DevActionLink> {
    const token = this.authService.generateActionToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000);

    await this.prisma.$transaction([
      // invalidate old unused tokens
      this.prisma.emailChangeToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),

      this.prisma.emailChangeToken.create({
        data: {
          userId,
          newEmail,
          tokenHash: this.authService.hashActionToken(token),
          expiresAt,
        },
      }),
    ]);

    return {
      token,
      url: this.authService.buildActionUrl("AUTH_EMAIL_VERIFICATION_URL", token),
      expiresAt,
    };
  }
}
