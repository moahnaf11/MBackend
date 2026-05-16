import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { AuthProvider, UserRole, UserStatus, type User } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "./auth.constants";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import type { AccessTokenPayload, GoogleProfile, RefreshTokenPayload } from "./types/auth.types";

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
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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

    return this.issueAuthResult(user, metadata);
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

    return this.toPublicUser(user);
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
}
