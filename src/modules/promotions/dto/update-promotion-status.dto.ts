import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { PromotionStatus } from "../../../../generated/prisma/enums";

export class UpdatePromotionStatusDto {
  @ApiProperty({ enum: PromotionStatus })
  @IsEnum(PromotionStatus)
  status!: PromotionStatus;
}
