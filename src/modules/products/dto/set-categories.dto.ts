import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEnum, IsString } from "class-validator";
import { ProductStatus } from "../../../../generated/prisma/enums";


// PUT /:id/categories — replaces the full category set atomically.
// Send an empty array to remove all categories.
export class SetCategoriesDto {
  @ApiProperty({
    type: [String],
    example: ["clx111", "clx222"],
    description: "Complete replacement list of category cuids. Send [] to clear all.",
  })
  @IsArray()
  @IsString({ each: true })
  categoryIds!: string[];
}

// PATCH /:id/status — admin-only route to force any status transition.
export class AdminSetStatusDto {
  @ApiProperty({ enum: ProductStatus, example: ProductStatus.ACTIVE })
  @IsEnum(ProductStatus)
  status!: ProductStatus;
}
