import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateSellerProfileDto {
  @ApiPropertyOptional({ example: "Ahnaf Tech Store" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  storeName?: string;

  @ApiPropertyOptional({ example: "Ahnaf Trading LLC" })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  legalName?: string;

  @ApiPropertyOptional({ example: "TAX-123456" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @ApiPropertyOptional({ example: "support@example.com" })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  supportEmail?: string;

  @ApiPropertyOptional({ example: "Curated everyday electronics and accessories." })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: "Orders ship within 2 business days." })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  shippingPolicy?: string;

  @ApiPropertyOptional({ example: "Returns accepted within 30 days." })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  returnPolicy?: string;
}
