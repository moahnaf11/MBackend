import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, Length, MaxLength, MinLength } from "class-validator";

export class CreateBankAccountDto {
  @ApiProperty({ example: "Sarah Connor", description: "Name on the bank account" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  holderName!: string;

  @ApiProperty({ example: "AE", description: "ISO 3166-1 alpha-2 country code" })
  @IsString()
  @Length(2, 2)
  country!: string;

  @ApiProperty({ example: "AED", description: "ISO 4217 currency code" })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ example: "1234", description: "Last 4 digits of the IBAN or account number" })
  @IsString()
  @Length(4, 4)
  last4!: string;

  @ApiPropertyOptional({ example: "Emirates NBD", description: "Human-friendly bank name" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @ApiPropertyOptional({
    description: "Payment provider name (e.g. stripe). Populated by backend after verification.",
  })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ description: "Provider's internal ID for this bank account" })
  @IsOptional()
  @IsString()
  providerBankAccountId?: string;

  @ApiPropertyOptional({ default: false, description: "Set as the default payout destination" })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
