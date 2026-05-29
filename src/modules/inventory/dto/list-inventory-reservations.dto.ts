import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { InventoryReservationStatus } from "../../../../generated/prisma/enums";

export class ListInventoryReservationsDto {
  @ApiPropertyOptional({ enum: InventoryReservationStatus })
  @IsOptional()
  @IsEnum(InventoryReservationStatus)
  status?: InventoryReservationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variantId?: string;
}
