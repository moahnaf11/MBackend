import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateVariantDto {
  @ApiProperty({ example: "IPHONE15PRO-256-BLACK", description: "Unique SKU" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sku!: string;

  @ApiProperty({ example: "256GB Space Black" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ example: 1199.99, description: "Price in the variant currency" })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  price!: number;

  @ApiPropertyOptional({
    example: 1299.99,
    description: "Original/compare-at price for strikethrough display",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  compareAtPrice?: number;

  @ApiPropertyOptional({ example: "USD", default: "USD" })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ example: 174, description: "Weight in grams for shipping calculations" })
  @IsOptional()
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @ApiPropertyOptional({
    example: { color: "Space Black", storage: "256GB" },
    description: "Free-form attribute bag — e.g. color, size, storage",
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}
