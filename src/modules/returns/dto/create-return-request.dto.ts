import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { CreateReturnItemDto } from "./create-return-item.dto";
import { ReturnReason } from "../../../../generated/prisma/enums";

export class CreateReturnRequestDto {
  @ApiProperty()
  @IsString()
  orderId!: string;

  @ApiProperty({ type: [CreateReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnItemDto)
  items!: CreateReturnItemDto[];

  @ApiProperty({ enum: ReturnReason })
  @IsEnum(ReturnReason)
  reason!: ReturnReason;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerNote?: string;
}
