import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateWarehouseDto {
  @ApiProperty({ example: "Dubai Main Warehouse" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: "DXB-01" })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @ApiProperty({ example: "AE" })
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  country!: string;

  @ApiPropertyOptional({ example: "Dubai" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @ApiProperty({ example: "Dubai" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;
}
