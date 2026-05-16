import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Profile, Strategy, VerifyCallback } from "passport-google-oauth20";
import type { GoogleProfile } from "../types/auth.types";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>("GOOGLE_CLIENT_ID") ?? "missing-google-client-id",
      clientSecret: config.get<string>("GOOGLE_CLIENT_SECRET") ?? "missing-google-client-secret",
      callbackURL:
        config.get<string>("GOOGLE_CALLBACK_URL") ??
        "http://localhost:3000/api/v1/auth/google/callback",
      scope: ["email", "profile"],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      done(new Error("Google account did not return an email address."));
      return;
    }

    const googleProfile: GoogleProfile = {
      providerAccountId: profile.id,
      email,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
    };

    done(null, googleProfile);
  }
}
