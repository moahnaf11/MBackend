import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateRefundDto {
  @ApiProperty({
    example: "clx1234paymentattemptid",
    description: "The PaymentAttempt cuid to refund against.",
  })
  @IsString()
  paymentAttemptId!: string;

  @ApiPropertyOptional({
    example: "clxorderitemid",
    description: "Specific order item to refund. If omitted, refunds the full order amount.",
  })
  @IsOptional()
  @IsString()
  orderItemId?: string;

  @ApiPropertyOptional({
    example: 1,
    description:
      "Quantity to refund. Only relevant when orderItemId is provided. Defaults to the full item quantity.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity?: number;

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
