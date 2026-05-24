import { IsBoolean } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateCategoryStatusDto {
  @ApiProperty({
    example: true,
    description:
      "true = visible to shoppers. false = hidden from public (soft delete). Reversible at any time.",
  })
  @IsBoolean()
  isActive!: boolean;
}
