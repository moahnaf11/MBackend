type Env = Record<string, string | undefined>;

const requiredVariables = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "REDIS_URL",
] as const;

export function validateEnv(config: Env) {
  const missing = requiredVariables.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    ...config,
    NODE_ENV: config.NODE_ENV ?? "development",
    PORT: Number(config.PORT ?? 3000),
  };
}
