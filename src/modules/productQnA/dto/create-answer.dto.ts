import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateAnswerDto {
  @ApiProperty({
    example: "Yes, this model supports 5G on both Sub-6GHz and mmWave bands.",
    description: "The answer body.",
    minLength: 5,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(5, { message: "Answer must be at least 5 characters." })
  @MaxLength(2000, { message: "Answer must be 2000 characters or less." })
  body!: string;
}
