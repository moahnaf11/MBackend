import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateQuestionDto {
  @ApiProperty({
    example: "Does this phone support 5G networks in the UAE?",
    description: "The question body. Must be a full sentence — min 10 chars.",
    minLength: 10,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(10, { message: "Question must be at least 10 characters." })
  @MaxLength(1000, { message: "Question must be 1000 characters or less." })
  body!: string;
}
