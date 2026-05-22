import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

const ALLOWED_SELLER_LOGO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export class CreateSellerLogoUploadUrlDto {
  @ApiProperty({ enum: ALLOWED_SELLER_LOGO_CONTENT_TYPES, example: "image/png" })
  @IsIn(ALLOWED_SELLER_LOGO_CONTENT_TYPES)
  contentType!: (typeof ALLOWED_SELLER_LOGO_CONTENT_TYPES)[number];

  @ApiProperty({ example: 128000, maximum: 2097152 })
  @IsInt()
  @Min(1)
  @Max(2 * 1024 * 1024)
  sizeBytes!: number;

  @ApiPropertyOptional({ example: "store-logo.png" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}
