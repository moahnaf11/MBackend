import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductOwnerGuard } from "./guards/product-owner.guard";
import { ProductsService } from "./products.service";

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductOwnerGuard],
  exports: [ProductsService],
})
export class ProductsModule {}
