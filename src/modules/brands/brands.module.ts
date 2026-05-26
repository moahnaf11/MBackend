import { Module } from "@nestjs/common";
import { BrandsController } from "./brands.controller";
import { BrandsService } from "./brands.service";

// PrismaModule is assumed to be global (@Global() on PrismaModule).
// If it is NOT global, import it here and add to imports array.

@Module({
  controllers: [BrandsController],
  providers: [BrandsService],
  exports: [BrandsService],
  // BrandsService is exported so ProductsModule can call findBySlug / findById
  // when validating the brandId on a product create/update.
})
export class BrandsModule {}
