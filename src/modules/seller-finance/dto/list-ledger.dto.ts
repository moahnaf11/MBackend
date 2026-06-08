import { IsEnum, IsInt, IsOptional, Max } from "class-validator";

import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { SellerLedgerEntryType } from "../../../../generated/prisma/enums";

export class ListLedgerDto {
  @ApiPropertyOptional({ enum: SellerLedgerEntryType })
  @IsOptional()
  @IsEnum(SellerLedgerEntryType)
  type?: SellerLedgerEntryType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 30, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
