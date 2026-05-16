import type { Request } from "express";
import type { UserRole } from "../../../../generated/prisma/client";

export type AuthenticatedUser = {
  id: string;
  email: string;
  roles: UserRole[];
};

export type AccessTokenPayload = {
  sub: string;
  email: string;
  roles: UserRole[];
  sessionId: string;
};

export type RefreshTokenPayload = {
  sub: string;
  sessionId: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
  cookies: Record<string, string | undefined>;
};

export type GoogleProfile = {
  providerAccountId: string;
  email: string;
  firstName?: string;
  lastName?: string;
};

export type GoogleRequest = Request & {
  user: GoogleProfile;
};
