import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { UserRole } from "../../../../generated/prisma/enums";
import { ROLES_KEY } from "./roles.decorator";

/**
 * Checks that the authenticated user has AT LEAST ONE of the required roles.
 * Required roles are set via the @Roles() decorator.
 *
 * Always stack AFTER JwtAuthGuard so req.user is populated.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles(UserRole.ADMIN)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator → route is open to all authenticated users
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException();

    const hasRole = requiredRoles.some((role) => (user.roles as UserRole[]).includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `This action requires one of these roles: ${requiredRoles.join(", ")}`,
      );
    }

    return true;
  }
}
