import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class ConfirmProductImageDto {
  @ApiProperty({
    example: "products/clx123/550e8400-e29b-41d4-a716-446655440000.webp",
    description: "Storage object key returned from the upload-url endpoint",
  })
  @IsString()
  objectKey!: string;

  @ApiPropertyOptional({
    example: "iPhone 15 Pro front view in Space Black",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;

  @ApiPropertyOptional({
    example: 0,
    description: "Display order — lower numbers appear first. Defaults to 0.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({
    example: "clx999variantid",
    description: "If set, this image is pinned to a specific variant",
  })
  @IsOptional()
  @IsString()
  variantId?: string;
}
