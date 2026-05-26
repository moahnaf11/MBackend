import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ProductStatus } from "../../../../generated/prisma/enums";


export class ListProductsDto {
  @ApiPropertyOptional({
    example: "iphone",
    description: "Partial title search — case insensitive",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: "clx111categoryid", description: "Filter by category cuid" })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: "clxbrandid", description: "Filter by brand cuid" })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({ example: "clxsellerid", description: "Filter by seller cuid" })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({
    enum: ProductStatus,
    description: "Admin only — public requests always receive ACTIVE products only",
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, description: "Max 100" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}
