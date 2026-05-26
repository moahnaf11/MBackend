import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateProductImageUploadUrlDto {
  @ApiProperty({
    example: "image/webp",
    description: "MIME type of the image being uploaded",
  })
  @IsString()
  @IsIn(["image/jpeg", "image/png", "image/webp"])
  contentType!: string;

  @ApiProperty({
    example: 5242880,
    description: "Image size in bytes",
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sizeBytes!: number;

  @ApiPropertyOptional({
    example: "clx999variantid",
    description: "Optional variant this image belongs to",
  })
  @IsOptional()
  @IsString()
  variantId?: string;
}
