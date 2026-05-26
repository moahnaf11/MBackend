import { PartialType } from "@nestjs/swagger";
import { CreateProductDto } from "./create-product.dto";

// All fields optional — only send what you want to change.
// categoryIds is intentionally excluded here; use PUT /:id/categories to replace the full set.
export class UpdateProductDto extends PartialType(CreateProductDto) {}
