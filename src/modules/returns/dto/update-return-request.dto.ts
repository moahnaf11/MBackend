import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { ReturnRequestStatus } from "../../../../generated/prisma/enums";

export class UpdateReturnStatusDto {
  @ApiProperty({ enum: ReturnRequestStatus })
  @IsEnum(ReturnRequestStatus)
  status!: ReturnRequestStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  resolutionNote?: string;
}
