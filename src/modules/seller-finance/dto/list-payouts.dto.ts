import { ApiPropertyOptional } from "@nestjs/swagger";

import { IsEnum, IsInt, IsOptional, Max } from "class-validator";
import { Type } from "class-transformer";
import { PayoutStatus } from "../../../../generated/prisma/enums";

export class ListPayoutsDto {
  @ApiPropertyOptional({ enum: PayoutStatus })
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
