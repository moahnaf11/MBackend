import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateReturnItemDto {
  @ApiProperty()
  @IsString()
  orderItemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  conditionNote?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;
}
