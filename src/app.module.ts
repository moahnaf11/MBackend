import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule } from "@nestjs/config";
import { ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { appConfig } from "./config/app.config";
import { validateEnv } from "./config/env.validation";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CartModule } from "./modules/cart/cart.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CustomerProfileModule } from "./modules/customer-profile/customer-profile.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { FulfillmentModule } from "./modules/fulfillment/fulfillment.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { SellerProfileModule } from "./modules/seller-profile/seller-profile.module";
import { SellersModule } from "./modules/sellers/sellers.module";
import { StorageModule } from "./modules/storage/storage.module";
import { UsersModule } from "./modules/users/users.module";
import { AddressesModule } from "./modules/addresses/addresses.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { BrandsModule } from "./modules/brands/brands.module";
import { ProductsModule } from "./modules/products/products.module";
import { ShipmentsModule } from "./modules/shipments/shipments.module";
import { ReturnsModule } from "./modules/returns/returns.module";
import { PromotionsModule } from "./modules/promotions/promotions.module";
import { SellerFinanceModule } from "./modules/seller-finance/seller-finance.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateEnv,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(config.getOrThrow<string>("REDIS_URL"));
        const db = redisUrl.pathname ? Number(redisUrl.pathname.slice(1)) : undefined;

        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            username: redisUrl.username || undefined,
            password: redisUrl.password || undefined,
            db: Number.isNaN(db) ? undefined : db,
            tls: redisUrl.protocol === "rediss:" ? {} : undefined,
          },
        };
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        transport:
          process.env.NODE_ENV === "production"
            ? undefined
            : {
                target: "pino-pretty",
                options: {
                  singleLine: false,
                },
              },
      },
    }),
    DatabaseModule,
    StorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    CustomerProfileModule,
    SellerProfileModule,
    AddressesModule,
    CategoriesModule,
    BrandsModule,
    ProductsModule,
    SellersModule,
    CatalogModule,
    InventoryModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    ShipmentsModule,
    ReturnsModule,
    ReviewsModule,
    PromotionsModule,
    SellerFinanceModule,
    FulfillmentModule,
  ],
})
export class AppModule {}
