import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { UserRole } from "../../../../generated/prisma/enums";
import { PrismaService } from "../../../database/prisma.service";

/**
 * Ensures the authenticated seller owns the product they are trying to mutate.
 *
 * MUST be used after JwtAuthGuard (relies on req.user being populated).
 * Admins bypass ownership checks entirely.
 *
 * Reads the product id from req.params.id.
 */
@Injectable()
export class ProductOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const productId = req.params.id;

    // Admins can touch any product.
    if (user.roles?.includes(UserRole.ADMIN)) {
      return true;
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { sellerId: true },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    // Check the seller's profile id, not the user id.
    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!sellerProfile || sellerProfile.id !== product.sellerId) {
      throw new ForbiddenException("You do not own this product");
    }

    // Attach the resolved sellerProfileId so the service doesn't have to look it up again.
    req.sellerProfileId = sellerProfile.id;
    return true;
  }
}
