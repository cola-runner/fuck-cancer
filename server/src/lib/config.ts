import "dotenv/config";
import { resolveNotebookLMStoragePath } from "./file-security.js";

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface AppConfig {
  databasePath: string;
  jwtSecret: string;
  encryptionKey: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  ownerEmail: string;
  /** Dedicated NotebookLM cookie jar path, including the legacy default-path fallback. */
  notebooklmStoragePath: string;
  appOrigin: string;
  corsOrigin: string;
  host: string;
  port: number;
  logLevel: LogLevel;
  nodeEnv: string;
}

function readRequiredEnv(
  env: NodeJS.ProcessEnv,
  name: keyof NodeJS.ProcessEnv,
  errors: string[]
): string {
  const value = env[name]?.trim();
  if (!value) {
    errors.push(`Missing required environment variable: ${name}`);
    return "";
  }
  return value;
}

function readOptionalEnv(
  env: NodeJS.ProcessEnv,
  name: keyof NodeJS.ProcessEnv,
  fallback: string
): string {
  return env[name]?.trim() || fallback;
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

function readPort(env: NodeJS.ProcessEnv, errors: string[]): number {
  const raw = env.PORT?.trim() || "3000";
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("PORT must be an integer between 1 and 65535");
    return 3000;
  }
  return port;
}

function readLogLevel(env: NodeJS.ProcessEnv): LogLevel {
  const raw = env.LOG_LEVEL?.trim() || "info";
  const allowed: LogLevel[] = ["fatal", "error", "warn", "info", "debug", "trace"];
  return allowed.includes(raw as LogLevel) ? (raw as LogLevel) : "info";
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export interface LoadConfigOptions {
  homeDirectory?: string;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {}
): AppConfig {
  const errors: string[] = [];

  const jwtSecret = readRequiredEnv(env, "JWT_SECRET", errors);
  const encryptionKey = readRequiredEnv(env, "ENCRYPTION_KEY", errors);
  const googleClientId = readRequiredEnv(env, "GOOGLE_CLIENT_ID", errors);
  const googleClientSecret = readRequiredEnv(env, "GOOGLE_CLIENT_SECRET", errors);
  const googleRedirectUri = readRequiredEnv(env, "GOOGLE_REDIRECT_URI", errors);
  const ownerEmail = normalizeEmail(readRequiredEnv(env, "OWNER_EMAIL", errors));

  const notebooklmStoragePath = resolveNotebookLMStoragePath(
    env.NOTEBOOKLM_STORAGE_PATH?.trim() ||
      env.GEMINI_NOTEBOOK_STORAGE?.trim() ||
      env.NOTEBOOKLM_STORAGE?.trim() ||
      undefined,
    options.homeDirectory
  );
  const appOrigin = readOptionalEnv(env, "APP_ORIGIN", "http://localhost:5173");
  const corsOrigin = readOptionalEnv(env, "CORS_ORIGIN", appOrigin);
  const databasePath = readOptionalEnv(env, "DATABASE_PATH", "./data/fuckcancer.db");
  const host = readOptionalEnv(env, "HOST", "0.0.0.0");
  const port = readPort(env, errors);
  const logLevel = readLogLevel(env);
  const nodeEnv = readOptionalEnv(env, "NODE_ENV", "development");

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
    ownerEmail,
    notebooklmStoragePath,
    appOrigin,
    corsOrigin,
    host,
    port,
    logLevel,
    nodeEnv,
  };
}

export const config = loadConfig();
