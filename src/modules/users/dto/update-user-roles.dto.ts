import { IsArray, IsEnum, ArrayMinSize, ArrayUnique } from "class-validator";
import { UserRole } from "../../../../generated/prisma/enums";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateUserRolesDto {
  @ApiProperty({
    enum: UserRole,
    enumName: "UserRole",
    isArray: true,
    example: [UserRole.CUSTOMER, UserRole.SELLER],
    description: "Full replacement of the user's roles array. At least one role is required.",
  })
  /**
   * Full replacement of the roles array.
   * Send the complete desired set — e.g. [CUSTOMER, SELLER].
   * At least one role is required.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  roles!: UserRole[];
}
