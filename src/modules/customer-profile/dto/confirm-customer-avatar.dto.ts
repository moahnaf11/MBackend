import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class ConfirmCustomerAvatarDto {
  @ApiProperty({
    example: "avatars/users/clx123/0c5f7a30-9f2a-4b9e-9bd0-6121bd5b2d74.webp",
  })
  @IsString()
  @MinLength(10)
  @MaxLength(1024)
  objectKey!: string;
}
