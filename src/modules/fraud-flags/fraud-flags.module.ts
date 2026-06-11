import { Module } from "@nestjs/common";
import { FraudFlagsController } from "./fraud-flags.controller";
import { FraudFlagsService } from "./fraud-flags.service";

@Module({
  controllers: [FraudFlagsController],
  providers: [FraudFlagsService],
})
export class FraudFlagsModule {}
