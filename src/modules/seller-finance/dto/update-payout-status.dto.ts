import { IsEnum, IsOptional, IsString } from "class-validator";

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PayoutStatus } from "../../../../generated/prisma/enums";

export class UpdatePayoutStatusDto {
  @ApiProperty({ enum: PayoutStatus })
  @IsEnum(PayoutStatus)
  status!: PayoutStatus;

  @ApiPropertyOptional({
    description: "Provider's payout/transfer ID (populated when status=PAID)",
  })
  @IsOptional()
  @IsString()
  providerPayoutId?: string;

  @ApiPropertyOptional({ description: "Reason for failure (populated when status=FAILED)" })
  @IsOptional()
  @IsString()
  failureReason?: string;
}
