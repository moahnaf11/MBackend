import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { SellerDocumentType } from "../../../../generated/prisma/enums";

const ALLOWED_SELLER_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export class CreateSellerDocumentUploadUrlDto {
  @ApiProperty({ enum: SellerDocumentType })
  @IsEnum(SellerDocumentType)
  type!: SellerDocumentType;

  @ApiProperty({ enum: ALLOWED_SELLER_DOCUMENT_CONTENT_TYPES, example: "application/pdf" })
  @IsIn(ALLOWED_SELLER_DOCUMENT_CONTENT_TYPES)
  contentType!: (typeof ALLOWED_SELLER_DOCUMENT_CONTENT_TYPES)[number];

  @ApiProperty({ example: 750000, maximum: 5242880 })
  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  sizeBytes!: number;

  @ApiPropertyOptional({ example: "business-license.pdf" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}
