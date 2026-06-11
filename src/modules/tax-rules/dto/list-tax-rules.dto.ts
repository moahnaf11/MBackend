import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { TaxRuleStatus } from "../../../../generated/prisma/enums";

export class ListTaxRulesDto {
  @ApiPropertyOptional({ enum: TaxRuleStatus })
  @IsOptional()
  @IsEnum(TaxRuleStatus)
  status?: TaxRuleStatus;

  @ApiPropertyOptional({ example: "AE", description: "Filter by country code" })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: "clxcategoryid", description: "Filter by category" })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: "clxbrandid", description: "Filter by brand" })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}
