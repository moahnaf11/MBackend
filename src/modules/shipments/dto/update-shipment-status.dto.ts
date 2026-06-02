import { ApiProperty } from "@nestjs/swagger";
import { ShipmentStatus } from "../../../../generated/prisma/enums";
import { IsEnum } from "class-validator";

export class UpdateShipmentStatusDto {
  @ApiProperty({
    enum: ShipmentStatus,
    example: ShipmentStatus.DELIVERED,
  })
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;
}
