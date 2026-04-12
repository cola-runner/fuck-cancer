import "dotenv/config";

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface AppConfig {
  databasePath: string;
  jwtSecret: string;
  encryptionKey: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  appOrigin: string;
  corsOrigin: string;
  host: string;
  port: number;
  logLevel: LogLevel;
  nodeEnv: string;
}

function readRequiredEnv(
  name: keyof NodeJS.ProcessEnv,
  errors: string[]
): string {
  const value = process.env[name]?.trim();
  if (!value) {
    errors.push(`Missing required environment variable: ${name}`);
    return "";
  }
  return value;
}

function readOptionalEnv(
  name: keyof NodeJS.ProcessEnv,
  fallback: string
): string {
  return process.env[name]?.trim() || fallback;
}

function readUrlEnv(name: keyof NodeJS.ProcessEnv, value: string, errors: string[]) {
  if (!value) {
    return;
  }
  try {
    new URL(value);
  } catch {
    errors.push(`${name} must be a valid absolute URL`);
  }
}

function readPort(errors: string[]): number {
  const raw = process.env.PORT?.trim() || "3000";
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("PORT must be an integer between 1 and 65535");
    return 3000;
  }
  return port;
}

function readLogLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim() || "info";
  const allowed: LogLevel[] = ["fatal", "error", "warn", "info", "debug", "trace"];
  return allowed.includes(raw as LogLevel) ? (raw as LogLevel) : "info";
}

function loadConfig(): AppConfig {
  const errors: string[] = [];

  const jwtSecret = readRequiredEnv("JWT_SECRET", errors);
  const encryptionKey = readRequiredEnv("ENCRYPTION_KEY", errors);
  const googleClientId = readRequiredEnv("GOOGLE_CLIENT_ID", errors);
  const googleClientSecret = readRequiredEnv("GOOGLE_CLIENT_SECRET", errors);
  const googleRedirectUri = readRequiredEnv("GOOGLE_REDIRECT_URI", errors);

  const appOrigin = readOptionalEnv("APP_ORIGIN", "http://localhost:5173");
  const corsOrigin = readOptionalEnv("CORS_ORIGIN", appOrigin);
  const databasePath = readOptionalEnv("DATABASE_PATH", "./data/fuckcancer.db");
  const host = readOptionalEnv("HOST", "0.0.0.0");
  const port = readPort(errors);
  const logLevel = readLogLevel();
  const nodeEnv = readOptionalEnv("NODE_ENV", "development");

  readUrlEnv("GOOGLE_REDIRECT_URI", googleRedirectUri, errors);
  readUrlEnv("APP_ORIGIN", appOrigin, errors);
  readUrlEnv("CORS_ORIGIN", corsOrigin, errors);

  if (errors.length > 0) {
    throw new Error(
      [
        "Invalid server configuration.",
        ...errors.map((error) => `- ${error}`),
        "Copy server/.env.example to server/.env and fill in the required values.",
      ].join("\n")
    );
  }

  return {
    databasePath,
    jwtSecret,
    encryptionKey,
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    appOrigin,
    corsOrigin,
    host,
    port,
    logLevel,
    nodeEnv,
  };
}

export const config = loadConfig();
