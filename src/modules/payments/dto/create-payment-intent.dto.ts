import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Length } from "class-validator";

export class CreatePaymentIntentDto {
  @ApiPropertyOptional({
    example: "pm_1234abcd",
    description:
      "Stripe PaymentMethod id — if omitted the frontend attaches it when confirming the intent.",
  })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiPropertyOptional({
    example: "USD",
    description: "Currency override — defaults to the order currency.",
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
