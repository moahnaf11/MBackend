import { IsOptional, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class MoveCategoryDto {
  @ApiPropertyOptional({
    example: "clx1a2b3c4d5e6f7g8h9i0j",
    description:
      "ID of the new parent category. Send null (or omit) to promote the category to the top level.",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
