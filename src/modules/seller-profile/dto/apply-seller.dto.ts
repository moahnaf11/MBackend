import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ApplySellerDto {
  @ApiProperty({ example: "Ahnaf Tech Store" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  storeName!: string;

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
}
