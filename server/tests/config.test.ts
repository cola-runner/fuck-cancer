import assert from "node:assert/strict";
import { test } from "node:test";

const baseEnv = {
  DATABASE_PATH: ":memory:",
  JWT_SECRET: "test-jwt-secret",
  ENCRYPTION_KEY: "00".repeat(32),
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
  APP_ORIGIN: "http://localhost:5173",
  CORS_ORIGIN: "http://localhost:5173",
  OWNER_EMAIL: "owner@example.com",
  NODE_ENV: "test",
};

Object.assign(process.env, baseEnv);

const configModule = await import("../src/lib/config.js");

test("缺少 OWNER_EMAIL 时拒绝启动", () => {
  const env = { ...baseEnv };
  delete env.OWNER_EMAIL;

  assert.throws(
    () => configModule.loadConfig(env),
    /Missing required environment variable: OWNER_EMAIL/
  );
});

test("OWNER_EMAIL 会去除空格并统一为小写", () => {
  const config = configModule.loadConfig({
    ...baseEnv,
    OWNER_EMAIL: "  Owner@Example.COM  ",
  });

  assert.equal(config.ownerEmail, "owner@example.com");
});
