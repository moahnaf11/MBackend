import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';


// PrismaModule is assumed to be global (@Global() on PrismaModule).
// If it is NOT global, import it here:
//   import { PrismaModule } from '../prisma/prisma.module';
// and add PrismaModule to the imports array.

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
  // CategoriesService is exported so ProductsModule can call
  // findBySlug / findById when assigning products to categories.
})
export class CategoriesModule {}