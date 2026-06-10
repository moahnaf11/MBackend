import { PartialType } from "@nestjs/swagger";
import { CreateQuestionDto } from "./create-question.dto";


// All fields optional — only body can be changed after posting.
export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}
