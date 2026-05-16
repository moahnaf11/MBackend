import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { CookieOptions, Request, Response } from "express";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL_SECONDS,
} from "./auth.constants";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { GoogleAuthGuard } from "./guards/google-auth.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { AuthenticatedRequest, GoogleRequest } from "./types/auth.types";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post("register")
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res() res: Response) {
    const result = await this.authService.register(dto, this.getRequestMetadata(req));
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return res.status(201).json({ user: result.user });
  }

  @HttpCode(200)
  @Post("login")
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res() res: Response) {
    const result = await this.authService.login(dto, this.getRequestMetadata(req));
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return res.json({ user: result.user });
  }

  @HttpCode(200)
  @Post("refresh")
  async refresh(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const result = await this.authService.refresh(
      req.cookies?.[REFRESH_TOKEN_COOKIE],
      this.getRequestMetadata(req),
    );
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return res.json({ user: result.user });
  }

  @HttpCode(200)
  @Post("logout")
  async logout(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    await this.authService.logout(req.cookies?.[REFRESH_TOKEN_COOKIE]);
    this.clearAuthCookies(res);
    return res.json({ success: true });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.authService.getCurrentUser(req.user.id);
    return { user };
  }

  @UseGuards(GoogleAuthGuard)
  @Get("google")
  googleAuth() {
    return;
  }

  @UseGuards(GoogleAuthGuard)
  @Get("google/callback")
  async googleCallback(@Req() req: GoogleRequest, @Res() res: Response) {
    const result = await this.authService.googleLogin(req.user, this.getRequestMetadata(req));
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return res.redirect(this.config.get<string>("AUTH_SUCCESS_REDIRECT_URL") ?? "/");
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...this.baseCookieOptions(),
      maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    });
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.baseCookieOptions(),
      maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, this.baseCookieOptions());
    res.clearCookie(REFRESH_TOKEN_COOKIE, this.baseCookieOptions());
  }

  private baseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get<string>("NODE_ENV") === "production",
      path: "/",
    };
  }

  private getRequestMetadata(req: Request) {
    return {
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    };
  }
}
