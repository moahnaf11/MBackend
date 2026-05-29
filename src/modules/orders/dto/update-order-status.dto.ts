import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { OrderStatus } from "../../../../generated/prisma/enums";

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional({ example: "Customer requested cancellation." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ example: { source: "admin_dashboard" } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
