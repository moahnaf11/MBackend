import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateBrandDto {
  @ApiProperty({
    example: "Apple",
    description: "Brand display name — must be unique across all brands",
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: "apple",
    description:
      "URL-friendly slug — lowercase letters, numbers, and hyphens only. Must be unique.",
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug may only contain lowercase letters, numbers, and hyphens (e.g. "apple" or "under-armour")',
  })
  slug!: string;

  @ApiPropertyOptional({
    example: "https://cdn.example.com/brands/apple-logo.png",
    description: "Optional URL to the brand logo image",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;
}
