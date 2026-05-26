import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";
import { PartialType } from "@nestjs/swagger";
import { CreateVariantDto } from "./create-variant.dto";

export class UpdateVariantDto extends PartialType(CreateVariantDto) {
  @ApiPropertyOptional({
    description:
      "Set false to deactivate this variant (hides from listings but preserves order history)",
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
