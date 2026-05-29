import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsString, Max, Min } from "class-validator";

export class AddCartItemDto {
  @ApiProperty({ example: "clxvariant123" })
  @IsString()
  variantId!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  @Type(() => Number)
  quantity!: number;
}
