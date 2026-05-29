import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class CreateOrderFromCartDto {
  @ApiProperty({ example: "clxshippingaddress123" })
  @IsString()
  shippingAddressId!: string;

  @ApiPropertyOptional({
    example: "clxbillingaddress123",
    description: "Defaults to the shipping address when omitted.",
  })
  @IsOptional()
  @IsString()
  billingAddressId?: string;
}
