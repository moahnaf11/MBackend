import { PartialType, OmitType } from "@nestjs/swagger";
import { CreateCategoryDto } from "./create-category.dto";

// PartialType makes every field optional and inherits all validators.
// OmitType removes parentId — parent changes go through the dedicated
// PATCH /:id/parent endpoint so the circular-reference check always runs.
export class UpdateCategoryDto extends PartialType(
  OmitType(CreateCategoryDto, ["parentId"] as const),
) {}
