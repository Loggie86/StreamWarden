export interface ApiConfig {
  host: string;
  port: number;
  databasePath: string;
  publicBaseUrl: string;
  dashboardPath: string;
  dashboardDirectory: string | null;
  mailProvider: "console" | "resend";
  resendApiKey: string | null;
  authFromEmail: string | null;
  tvdbApiKey: string | null;
  tvdbPin: string | null;
  tvdbBaseUrl: string;
  exposeDevelopmentLinks: boolean;
  production: boolean;
  magicLinkLifetimeMs: number;
  sessionLifetimeMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const production = env.NODE_ENV === "production";
  const mailProvider = env.MAIL_PROVIDER === "resend" ? "resend" : "console";
  if (production && mailProvider === "console") {
    throw new Error("MAIL_PROVIDER=resend is required in production");
  }
  if (mailProvider === "resend" && (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL)) {
    throw new Error("RESEND_API_KEY and AUTH_FROM_EMAIL are required for Resend");
  }

  return {
    host: env.HOST ?? "0.0.0.0",
    port: Number.parseInt(env.PORT ?? "8080", 10),
    databasePath: env.STREAMWARDEN_DB_PATH ?? env.GUARDIAN_DB_PATH ?? "./data/streamwarden.sqlite",
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? "http://localhost:8080").replace(/\/$/, ""),
    dashboardPath: env.DASHBOARD_PATH ?? "/",
    dashboardDirectory: env.DASHBOARD_DIR ?? "./apps/dashboard/dist",
    mailProvider,
    resendApiKey: env.RESEND_API_KEY ?? null,
    authFromEmail: env.AUTH_FROM_EMAIL ?? null,
    tvdbApiKey: env.TVDB_API_KEY?.trim() || null,
    tvdbPin: env.TVDB_PIN?.trim() || null,
    tvdbBaseUrl: (env.TVDB_API_BASE_URL ?? "https://api4.thetvdb.com/v4").replace(/\/$/, ""),
    exposeDevelopmentLinks: !production && env.EXPOSE_DEV_MAGIC_LINKS === "1",
    production,
    magicLinkLifetimeMs: 15 * 60 * 1000,
    sessionLifetimeMs: 30 * 24 * 60 * 60 * 1000,
  };
}
