import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { FraudFlagStatus } from "../../../../generated/prisma/enums";

export class UpdateFraudFlagStatusDto {
  @ApiProperty({ enum: FraudFlagStatus })
  @IsEnum(FraudFlagStatus)
  status!: FraudFlagStatus;
}
