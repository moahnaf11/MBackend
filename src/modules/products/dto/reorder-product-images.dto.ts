import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsString, Min, ValidateNested } from "class-validator";

class ProductImageOrderDto {
  @ApiProperty({ example: "clximage123" })
  @IsString()
  id!: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder!: number;
}

export class ReorderProductImagesDto {
  @ApiProperty({ type: [ProductImageOrderDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductImageOrderDto)
  images!: ProductImageOrderDto[];
}
