import { SetMetadata } from "@nestjs/common";
import { UserRole } from "../../../../generated/prisma/enums";


export const ROLES_KEY = "roles";

/**
 * Decorator that marks which roles are required to access a route.
 * Used together with RolesGuard.
 *
 * @example
 *   @Roles(UserRole.ADMIN)
 *   @Roles(UserRole.ADMIN, UserRole.SUPPORT)  // either role works
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
