import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class SetVisibilityDto {
  @ApiProperty({
    example: false,
    description:
      "true = visible to shoppers. false = hidden (soft moderation). Reversible at any time.",
  })
  @IsBoolean()
  isVisible!: boolean;
}
