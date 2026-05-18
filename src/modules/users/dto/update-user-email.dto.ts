import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, MaxLength } from "class-validator";

export class UpdateUserEmailDto {
  @ApiProperty({
    example: "newemail@example.com",
    description: "New email address to verify",
  })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
