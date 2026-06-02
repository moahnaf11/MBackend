import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";
import { Type } from "class-transformer";

export class CreateRefundDto {
  @ApiProperty({
    example: "clx1234paymentattemptid",
    description: "The PaymentAttempt cuid to refund against.",
  })
  @IsString()
  paymentAttemptId!: string;

  @ApiProperty({
    example: 49.99,
    description: "Amount to refund in the order currency. Must not exceed the captured amount.",
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  amount!: number;

  @ApiPropertyOptional({
    example: "Customer requested return — item not as described.",
    description: "Internal reason note recorded on the Refund row.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
