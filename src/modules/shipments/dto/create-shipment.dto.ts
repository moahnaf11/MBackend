import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from "class-validator";
import { CreateShipmentItemDto } from "./create-shipment-item.dto";

export class CreateShipmentDto {
  @ApiProperty({
    description: "Order being shipped",
    example: "cmorder123456",
  })
  @IsString()
  orderId!: string;

  @ApiPropertyOptional({
    description: "Shipping carrier",
    example: "DHL",
  })
  @IsOptional()
  @IsString()
  carrier?: string;

  @ApiPropertyOptional({
    description: "Carrier tracking number",
    example: "DHL123456789",
  })
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiProperty({
    type: [CreateShipmentItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentItemDto)
  items!: CreateShipmentItemDto[];
}
