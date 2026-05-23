import { Module } from "@nestjs/common";
import { AddressesController } from "./addresses.controller";
import { AddressesService } from "./addresses.service";

// PrismaModule is assumed to be global (@Global() decorator on PrismaModule).
// If it is NOT global in your project, add:
//   import { PrismaModule } from '../prisma/prisma.module';
// and add PrismaModule to the imports array below.

@Module({
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService], // exported so OrdersModule can call findDefault() at checkout
})
export class AddressesModule {}
