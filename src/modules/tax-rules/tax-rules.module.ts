import { Module } from "@nestjs/common";

import { TaxRulesService } from "./tax-rules.service";
import { TaxRulesController } from "./tax-rules.controller";

@Module({
  controllers: [TaxRulesController],
  providers: [TaxRulesService],
  exports: [TaxRulesService], // exported so OrdersModule can inject TaxRulesService
})
export class TaxRulesModule {}
