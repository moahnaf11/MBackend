// ─── dto/request-payout.dto.ts ────────────────────────────────────────────────
import { IsOptional, IsString } from "class-validator";

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RequestPayoutDto {
  @ApiProperty({
    example: "250.00",
    description:
      "Amount to withdraw. Must not exceed your available balance. Send as a string to preserve decimal precision.",
  })
  @IsString()
  amount!: string; // accepted as string, parsed to Decimal in service

  @ApiPropertyOptional({
    description: "Bank account ID to pay out to. Defaults to your default account.",
  })
  @IsOptional()
  @IsString()
  bankAccountId?: string;
}
