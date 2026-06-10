import { Module } from "@nestjs/common";

import { QuestionsController } from "./questions.controller";
import { ProductQuestionsController } from "./productqa.controller";
import { ProductQaService } from "./productqa.service";

@Module({
  controllers: [ProductQuestionsController, QuestionsController],
  providers: [ProductQaService],
  exports: [ProductQaService],
})
export class ProductQaModule {}
