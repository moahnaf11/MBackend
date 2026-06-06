import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class ModerateReviewDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isVisible!: boolean;
}
