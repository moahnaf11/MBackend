import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { TaxRuleStatus } from "../../../../generated/prisma/enums";

export class CreateTaxRuleDto {
  @ApiProperty({
    example: "UAE Standard VAT",
    description: "Human-readable name for this rule",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: "AE",
    description: "ISO 3166-1 alpha-2 country code — required, this is the base match",
  })
  @IsString()
  @MaxLength(2)
  country!: string;

  @ApiPropertyOptional({
    example: "DXB",
    description: "Region/emirate/state code — if set, rule only matches this region",
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  region?: string;

  @ApiPropertyOptional({
    example: "clxcategoryid",
    description: "If set, rule only applies to products in this category",
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    example: "clxbrandid",
    description: "If set, rule only applies to products of this brand",
  })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiProperty({
    example: 0.05,
    description: "Tax rate as a decimal — 0.05 = 5%, 0.0 = exempt",
    minimum: 0,
    maximum: 1,
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  @Type(() => Number)
  rate!: number;

  @ApiPropertyOptional({
    example: 10,
    default: 100,
    description:
      "Lower number = higher priority. When multiple rules match an item, the lowest priority number wins.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({ enum: TaxRuleStatus, default: TaxRuleStatus.ACTIVE })
  @IsOptional()
  @IsEnum(TaxRuleStatus)
  status?: TaxRuleStatus;

  @ApiProperty({
    example: "2025-01-01T00:00:00.000Z",
    description: "When this rule becomes effective",
  })
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional({
    example: "2025-12-31T23:59:59.999Z",
    description: "When this rule expires — omit for open-ended rules",
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
