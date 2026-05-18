import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { EmailModule } from "../email/email.module";
import { AuthModule } from "../auth/auth.module";

// PrismaModule must be global (or imported here) — assuming it's global
// If not global: import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [EmailModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
