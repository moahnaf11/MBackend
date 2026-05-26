import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateProductDto {
  @ApiProperty({ example: "Apple iPhone 15 Pro", description: "Product title" })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({
    example: "iphone-15-pro",
    description: "URL slug — auto-generated from title if omitted",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @ApiPropertyOptional({ example: "The latest iPhone with titanium build…" })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({
    example: "clx1234abcd",
    description: "Brand cuid — omit if no brand",
  })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["clx111", "clx222"],
    description: "Initial category cuids to assign",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];
}
