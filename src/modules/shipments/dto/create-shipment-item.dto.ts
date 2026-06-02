import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsString, Min } from "class-validator";

export class CreateShipmentItemDto {
  @ApiProperty({
    description: "Order item being shipped",
    example: "cmxyz123456",
  })
  @IsString()
  orderItemId!: string;

  @ApiProperty({
    description: "Quantity shipped",
    example: 2,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  quantity!: number;
}
