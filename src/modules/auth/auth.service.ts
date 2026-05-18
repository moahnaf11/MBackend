import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import { AuthProvider, UserRole, UserStatus, type User } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "./auth.constants";
import type { ForgotPasswordDto } from "./dto/forgot-password.dto";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import type { RequestEmailVerificationDto } from "./dto/request-email-verification.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";
import type { VerifyEmailDto } from "./dto/verify-email.dto";
import type { AccessTokenPayload, GoogleProfile, RefreshTokenPayload } from "./types/auth.types";
import { EmailService } from "../email/email.service";

type RequestMetadata = {
  userAgent?: string;
  ipAddress?: string;
};

type PublicUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roles: UserRole[];
};

type AuthResult = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  emailVerification?: DevActionLink;
};

type DevActionLink = {
  token: string;
  url: string;
  expiresAt: Date;
};

type GenericAuthMessage = {
  message: string;
  dev?: DevActionLink;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto, metadata: RequestMetadata): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException("A user with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        roles: [UserRole.CUSTOMER],
        customerProfile: {
          create: {
            displayName: `${dto.firstName.trim()} ${dto.lastName.trim()}`,
          },
        },
      },
    });

    const authResult = await this.issueAuthResult(user, metadata);
    authResult.emailVerification = await this.createEmailVerificationToken(user.id);
    await this.emailService.sendVerificationEmail(user.email, authResult.emailVerification.url);
    return authResult;
  }

  async login(dto: LoginDto, metadata: RequestMetadata): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueAuthResult(user, metadata);
  }

  async googleLogin(profile: GoogleProfile, metadata: RequestMetadata): Promise<AuthResult> {
    const email = profile.email.trim().toLowerCase();

    const existingAccount = await this.prisma.oauthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: AuthProvider.GOOGLE,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });

    if (existingAccount) {
      if (existingAccount.user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException("This account is not active.");
      }

      await this.prisma.user.update({
        where: { id: existingAccount.userId },
        data: { lastLoginAt: new Date() },
      });

      return this.issueAuthResult(existingAccount.user, metadata);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email } });

      if (existingUser) {
        return tx.user.update({
          where: { id: existingUser.id },
          data: {
            emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
            lastLoginAt: new Date(),
            oauthAccounts: {
              create: {
                provider: AuthProvider.GOOGLE,
                providerAccountId: profile.providerAccountId,
                email,
              },
            },
          },
        });
      }

      return tx.user.create({
        data: {
          email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          roles: [UserRole.CUSTOMER],
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
          customerProfile: {
            create: {
              displayName: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || email,
            },
          },
          oauthAccounts: {
            create: {
              provider: AuthProvider.GOOGLE,
              providerAccountId: profile.providerAccountId,
              email,
            },
          },
        },
      });
    });

    return this.issueAuthResult(user, metadata);
  }

  async refresh(refreshToken: string | undefined, metadata: RequestMetadata): Promise<AuthResult> {
    if (!refreshToken) {
      throw new UnauthorizedException("Missing refresh token.");
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const refreshMatches = await bcrypt.compare(refreshToken, session.refreshTokenHash);

    if (!refreshMatches) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const accessToken = await this.signAccessToken(session.user, session.id);
    const nextRefreshToken = await this.signRefreshToken(session.user.id, session.id);

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: await bcrypt.hash(nextRefreshToken, 12),
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      },
    });

    return {
      user: this.toPublicUser(session.user),
      accessToken,
      refreshToken: nextRefreshToken,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      await this.prisma.authSession.updateMany({
        where: {
          id: payload.sessionId,
          userId: payload.sub,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    } catch {
      return;
    }
  }

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("User is not active.");
    }
    console.log("date", user.emailVerifiedAt);

    return this.toPublicUser(user);
  }

  async requestEmailVerification(dto: RequestEmailVerificationDto): Promise<GenericAuthMessage> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true, status: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE || user.emailVerifiedAt) {
      return {
        message: "If this account needs verification, a verification email will be sent.",
      };
    }

    const dev = await this.createEmailVerificationToken(user.id);
    await this.emailService.sendVerificationEmail(email, dev.url);

    return {
      message: "Verification sent. Please check your spam folder if not found in inbox",
      dev,
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const tokenHash = this.hashActionToken(dto.token);
    const verificationToken = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !verificationToken ||
      verificationToken.usedAt ||
      verificationToken.expiresAt <= new Date() ||
      verificationToken.user.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException("Invalid or expired verification token.");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerifiedAt: verificationToken.user.emailVerifiedAt ?? new Date() },
      }),

      this.prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.updateMany({
        where: {
          userId: verificationToken.userId,
          id: { not: verificationToken.id },
          usedAt: null,
        },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: "Email verified successfully." };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<GenericAuthMessage> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      return {
        message: "If an account exists for this email, a password reset email will be sent.",
      };
    }

    const dev = await this.createPasswordResetToken(user.id);
    await this.emailService.sendPasswordResetEmail(email, dev.url);

    return {
      message: "Password reset email sent. Please check your spam folder if not found in inbox",
      dev,
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = this.hashActionToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt <= new Date() ||
      resetToken.user.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException("Invalid or expired password reset token.");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          id: { not: resetToken.id },
          usedAt: null,
        },
        data: { usedAt: new Date() },
      }),
      this.prisma.authSession.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: "Password reset successfully. Please log in again." };
  }

  private async issueAuthResult(user: User, metadata: RequestMetadata): Promise<AuthResult> {
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: "pending",
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        expiresAt,
      },
    });

    const accessToken = await this.signAccessToken(user, session.id);
    const refreshToken = await this.signRefreshToken(user.id, session.id);

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: await bcrypt.hash(refreshToken, 12),
      },
    });

    return {
      user: this.toPublicUser(user),
      accessToken,
      refreshToken,
    };
  }

  private signAccessToken(user: User, sessionId: string) {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      sessionId,
    };

    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  private signRefreshToken(userId: string, sessionId: string) {
    const payload: RefreshTokenPayload = {
      sub: userId,
      sessionId,
    };

    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    });
  }

  private verifyRefreshToken(refreshToken: string) {
    return this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
    });
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
    };
  }

  private async createEmailVerificationToken(userId: string): Promise<DevActionLink> {
    const token = this.generateActionToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000);

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          userId,
          tokenHash: this.hashActionToken(token),
          expiresAt,
        },
      }),
    ]);

    return {
      token,
      url: this.buildActionUrl("AUTH_EMAIL_VERIFICATION_URL", token),
      expiresAt,
    };
  }

  private async createPasswordResetToken(userId: string): Promise<DevActionLink> {
    const token = this.generateActionToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash: this.hashActionToken(token),
          expiresAt,
        },
      }),
    ]);

    return {
      token,
      url: this.buildActionUrl("AUTH_PASSWORD_RESET_URL", token),
      expiresAt,
    };
  }

  generateActionToken(): string {
    return randomBytes(32).toString("hex");
  }

  hashActionToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  buildActionUrl(configKey: string, token: string): string {
    const baseUrl = this.config.get<string>(configKey) ?? "http://localhost:5173";
    const url = new URL(baseUrl);
    url.searchParams.set("token", token);
    return url.toString();
  }
}
