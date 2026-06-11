import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { FraudFlagSeverity } from "../../../../generated/prisma/enums";

export class CreateFraudFlagDto {
  @ApiPropertyOptional({ description: "ID of the user being flagged" })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: "ID of the order being flagged" })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiProperty({ enum: FraudFlagSeverity, default: FraudFlagSeverity.MEDIUM })
  @IsEnum(FraudFlagSeverity)
  severity!: FraudFlagSeverity;

  @ApiProperty({ example: "Multiple failed payment attempts from different cards" })
  @IsString()
  @MinLength(10)
  reason!: string;

  @ApiPropertyOptional({
    description: "Freeform metadata — IP addresses, device fingerprints, etc.",
    example: { ipAddress: "1.2.3.4", attempts: 5 },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
