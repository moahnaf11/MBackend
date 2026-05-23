import { PartialType } from "@nestjs/swagger";
import { CreateAddressDto } from "./create-address.dto";

// PartialType makes every field from CreateAddressDto optional,
// and inherits all the validators and @ApiProperty decorators.
// This means you can PATCH just the city, or just the phone — anything you don't
// send stays exactly as it was in the database.
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
