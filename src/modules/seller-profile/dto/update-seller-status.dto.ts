import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { SellerStatus } from "../../../../generated/prisma/enums";

export class UpdateSellerStatusDto {
  @ApiProperty({ enum: SellerStatus })
  @IsEnum(SellerStatus)
  status!: SellerStatus;

  @ApiProperty({ required: false, example: "Business license verified." })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
