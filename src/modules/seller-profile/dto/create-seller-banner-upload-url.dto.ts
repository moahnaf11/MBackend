import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

const ALLOWED_SELLER_BANNER_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export class CreateSellerBannerUploadUrlDto {
  @ApiProperty({ enum: ALLOWED_SELLER_BANNER_CONTENT_TYPES, example: "image/webp" })
  @IsIn(ALLOWED_SELLER_BANNER_CONTENT_TYPES)
  contentType!: (typeof ALLOWED_SELLER_BANNER_CONTENT_TYPES)[number];

  @ApiProperty({ example: 512000, maximum: 2097152 })
  @IsInt()
  @Min(1)
  @Max(2 * 1024 * 1024)
  sizeBytes!: number;

  @ApiPropertyOptional({ example: "store-banner.webp" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}
