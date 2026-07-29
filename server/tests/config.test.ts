import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(
    temporaryRoots.map((path) => rm(path, { recursive: true, force: true }))
  );
});

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

test("配置未指定会话文件时沿用旧版 CLI 的现有会话", async () => {
  const root = await mkdtemp(join(tmpdir(), "fc-config-legacy-session-"));
  temporaryRoots.push(root);
  const legacyPath = join(
    root,
    ".config",
    "notebooklm-cli",
    "storage_state.json"
  );
  await mkdir(join(root, ".config", "notebooklm-cli"), { recursive: true });
  await writeFile(legacyPath, "legacy-session");

  const config = configModule.loadConfig(baseEnv, { homeDirectory: root });

  assert.equal(config.notebooklmStoragePath, legacyPath);
});

test("兼容新版 CLI 的 GEMINI_NOTEBOOK_STORAGE 环境变量", () => {
  const configuredPath = "/private/new-cli/storage_state.json";

  const config = configModule.loadConfig({
    ...baseEnv,
    GEMINI_NOTEBOOK_STORAGE: configuredPath,
  });

  assert.equal(config.notebooklmStoragePath, configuredPath);
});

test("兼容旧版 CLI 的 NOTEBOOKLM_STORAGE 环境变量", () => {
  const configuredPath = "/private/legacy-cli/storage_state.json";

  const config = configModule.loadConfig({
    ...baseEnv,
    NOTEBOOKLM_STORAGE: configuredPath,
  });

  assert.equal(config.notebooklmStoragePath, configuredPath);
});

test("应用专用会话路径优先于新旧 CLI 环境变量", () => {
  const configuredPath = "/private/app/storage_state.json";

  const config = configModule.loadConfig({
    ...baseEnv,
    NOTEBOOKLM_STORAGE_PATH: configuredPath,
    GEMINI_NOTEBOOK_STORAGE: "/private/new-cli/storage_state.json",
    NOTEBOOKLM_STORAGE: "/private/legacy-cli/storage_state.json",
  });

  assert.equal(config.notebooklmStoragePath, configuredPath);
});
