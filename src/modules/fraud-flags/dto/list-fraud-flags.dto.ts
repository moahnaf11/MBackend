import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { FraudFlagSeverity, FraudFlagStatus } from "../../../../generated/prisma/enums";

export class ListFraudFlagsDto {
  @ApiPropertyOptional({ enum: FraudFlagStatus })
  @IsOptional()
  @IsEnum(FraudFlagStatus)
  status?: FraudFlagStatus;

  @ApiPropertyOptional({ enum: FraudFlagSeverity })
  @IsOptional()
  @IsEnum(FraudFlagSeverity)
  severity?: FraudFlagSeverity;

  @ApiPropertyOptional({ description: "Filter by subject user ID" })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: "Filter by order ID" })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
