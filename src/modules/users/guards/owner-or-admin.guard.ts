import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "../../../../generated/prisma/enums";

@Injectable()
export class OwnerOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user; // set by JwtAuthGuard
    const targetId = req.params.id; // the :id in the URL

    const isOwner = user.id === targetId;
    const isAdmin = user.roles.includes(UserRole.ADMIN);

    if (!isOwner && !isAdmin)
      throw new ForbiddenException("You are not an admin or owner of this account");
    return true;
  }
}
