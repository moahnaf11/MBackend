import { Module } from "@nestjs/common";
import { SellerProfileController } from "./seller-profile.controller";
import { SellerProfileService } from "./seller-profile.service";
import { OutboxModule } from "../../common/outbox/outbox.module";

@Module({
  imports: [OutboxModule],
  controllers: [SellerProfileController],
  providers: [SellerProfileService],
})
export class SellerProfileModule {}
