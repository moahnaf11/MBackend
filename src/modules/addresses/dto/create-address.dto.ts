import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AddressType } from "../../../../generated/prisma/enums";


export class CreateAddressDto {
  @ApiProperty({ example: "Sarah Connor", description: "Full name for the delivery label" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: "123 Sheikh Zayed Road", description: "Street address line 1" })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional({ example: "Apartment 4B", description: "Apartment, floor, suite, etc." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @ApiProperty({ example: "Dubai", description: "City name" })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city!: string;

  @ApiPropertyOptional({ example: "Dubai", description: "State, emirate, or province" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiProperty({ example: "00000", description: "Postal / ZIP code" })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  postalCode!: string;

  @ApiProperty({ example: "AE", description: "ISO 3166-1 alpha-2 country code" })
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  country!: string;

  @ApiPropertyOptional({
    example: "+971501234567",
    description: "Phone number for delivery driver — E.164 format",
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: "phone must be a valid E.164 number e.g. +971501234567",
  })
  phone?: string;

  @ApiPropertyOptional({
    enum: AddressType,
    default: AddressType.SHIPPING,
    description: "Whether this address is used for shipping, billing, or both",
  })
  @IsOptional()
  @IsEnum(AddressType)
  type?: AddressType;

  @ApiPropertyOptional({
    default: false,
    description: "Set this address as the default. Clears the default flag on all other addresses.",
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
