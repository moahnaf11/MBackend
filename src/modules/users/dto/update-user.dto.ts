import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, Matches } from "class-validator";

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: "Mohammad",
    maxLength: 100,
    description: "User first name",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    example: "Ahnaf",
    maxLength: 100,
    description: "User last name",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    example: "+971501234567",
    description: "Phone number in E.164 international format",
  })
  /**
   * E.164 format: +971501234567
   * Allows international numbers with optional leading +
   */
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: "phone must be a valid E.164 phone number e.g. +971501234567",
  })
  phone?: string;
}
