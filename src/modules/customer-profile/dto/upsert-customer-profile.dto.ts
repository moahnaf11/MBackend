import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpsertCustomerProfileDto {
  @ApiPropertyOptional({ example: "Ahnaf" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({ example: "2000-01-01" })
  @IsOptional()
  @IsDateString()
  birthDate?: string;
}
