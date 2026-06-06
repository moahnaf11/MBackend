import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class CreateCouponDto {
  @ApiProperty({ example: "SUMMER20" })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  code!: string;

  @ApiPropertyOptional({ example: 1000, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  usageLimit?: number;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  usageLimitPerUser?: number;
}
