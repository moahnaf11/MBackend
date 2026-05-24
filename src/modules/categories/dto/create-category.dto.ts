import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Smartphones',
    description: 'Display name shown to shoppers',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'smartphones',
    description:
      'URL-friendly slug — lowercase letters, numbers, and hyphens only. Must be unique.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug may only contain lowercase letters, numbers, and hyphens (e.g. "smart-phones")',
  })
  slug!: string;

  @ApiPropertyOptional({
    example: 'Browse our full range of smartphones from all major brands.',
    description: 'Optional short description shown on the category page',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 'clx1a2b3c4d5e6f7g8h9i0j',
    description:
      'ID of the parent category. Omit (or send null) to create a top-level category.',
  })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Whether this category is visible to shoppers. Defaults to true.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}