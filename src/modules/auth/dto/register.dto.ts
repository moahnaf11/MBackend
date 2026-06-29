import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { Match } from "./decorators/match.decorator";

export class RegisterDto {
  @ApiProperty({ example: "customer@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Match("password", { message: "Confirm Password must match password" })
  confirmPassword!: string;

  @ApiProperty({ example: "Ahnaf" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: "Rahman" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;
}
