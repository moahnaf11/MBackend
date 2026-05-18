import { IsEnum } from "class-validator";
import { UserStatus } from "../../../../generated/prisma/enums";
import { ApiProperty } from "@nestjs/swagger";

// Admins can only flip between ACTIVE and SUSPENDED via this endpoint.
// DELETED is handled by the DELETE /users/:id endpoint (soft-delete).
const ALLOWED_STATUSES = [UserStatus.ACTIVE, UserStatus.SUSPENDED] as const;

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: ALLOWED_STATUSES,
    example: UserStatus.SUSPENDED,
    description: "Allowed user statuses. DELETED is handled separately via soft delete.",
  })
  @IsEnum(ALLOWED_STATUSES, {
    message: `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
  })
  status!: (typeof ALLOWED_STATUSES)[number];
}
