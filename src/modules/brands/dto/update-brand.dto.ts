import { PartialType } from "@nestjs/swagger";
import { CreateBrandDto } from "./create-brand.dto";

// Every field from CreateBrandDto becomes optional.
// All validators and @ApiProperty decorators are inherited automatically.
// Send only the fields you want to change.
export class UpdateBrandDto extends PartialType(CreateBrandDto) {}
