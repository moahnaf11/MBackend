import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SellerDocumentType } from "../../../../generated/prisma/enums";

export class ConfirmSellerDocumentDto {
  @ApiProperty({ enum: SellerDocumentType })
  @IsEnum(SellerDocumentType)
  type!: SellerDocumentType;

  @ApiProperty({
    example: "seller-documents/clx123/0c5f7a30-9f2a-4b9e-9bd0-6121bd5b2d74.pdf",
  })
  @IsString()
  @MinLength(10)
  @MaxLength(1024)
  objectKey!: string;

  @ApiPropertyOptional({ example: "business-license.pdf" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional({ example: "application/pdf" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contentType?: string;
}
