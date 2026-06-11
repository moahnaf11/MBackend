import { IsBoolean, IsEnum, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

import { NotificationEventType } from "../constants/notification-events";
import { NotificationChannel } from "../../../../generated/prisma/enums";

export class UpdatePreferenceDto {
  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty({ example: "order.placed" })
  @IsString()
  eventType!: NotificationEventType;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
