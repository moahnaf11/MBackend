export const appConfig = () => ({
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  authSuccessRedirectUrl: process.env.AUTH_SUCCESS_REDIRECT_URL,
  authEmailVerificationUrl: process.env.AUTH_EMAIL_VERIFICATION_URL,
  authPasswordResetUrl: process.env.AUTH_PASSWORD_RESET_URL,
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL,
});
