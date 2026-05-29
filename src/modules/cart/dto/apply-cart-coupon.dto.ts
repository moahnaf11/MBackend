import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class ApplyCartCouponDto {
  @ApiProperty({ example: "SUMMER20" })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  couponCode!: string;
}
