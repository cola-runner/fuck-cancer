import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  chmod,
  mkdtemp,
  mkdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

Object.assign(process.env, {
  DATABASE_PATH: ":memory:",
  JWT_SECRET: "test-jwt-secret",
  ENCRYPTION_KEY: "00".repeat(32),
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
  OWNER_EMAIL: "owner@example.com",
  APP_ORIGIN: "http://localhost:5173",
  CORS_ORIGIN: "http://localhost:5173",
  NOTEBOOKLM_STORAGE_PATH: "/tmp/fc-missing-storage-state.json",
  NODE_ENV: "test",
});

const fileSecurity = await import("../src/lib/file-security.js");
const { hardenRuntimePermissions, resolveNotebookLMStoragePath } =
  fileSecurity;
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(
    temporaryRoots.map((path) => rm(path, { recursive: true, force: true }))
  );
});

function modeOf(stats: Awaited<ReturnType<typeof stat>>): number {
  return stats.mode & 0o777;
}

test("运行时把病历、会话和环境文件收紧为仅部署用户可读", async () => {
  const root = await mkdtemp(join(tmpdir(), "fc-permissions-"));
  temporaryRoots.push(root);
  const dataDir = join(root, "data");
  const sessionDir = join(root, "notebooklm");
  const databasePath = join(dataDir, "fuckcancer.db");
  const storagePath = join(sessionDir, "storage_state.json");
  const envPath = join(root, ".env");

  await mkdir(dataDir, { mode: 0o755 });
  await mkdir(sessionDir, { mode: 0o755 });
  await writeFile(databasePath, "db", { mode: 0o644 });
  await writeFile(storagePath, "cookies", { mode: 0o644 });
  await writeFile(envPath, "JWT_SECRET=test", { mode: 0o644 });
  await Promise.all([
    chmod(dataDir, 0o755),
    chmod(sessionDir, 0o755),
    chmod(databasePath, 0o644),
    chmod(storagePath, 0o644),
    chmod(envPath, 0o644),
  ]);

  const previousUmask = process.umask();
  try {
    hardenRuntimePermissions({
      databasePath,
      notebooklmStoragePath: storagePath,
      envPath,
    });

    assert.equal(process.umask(), 0o077);
    assert.equal(modeOf(await stat(dataDir)), 0o700);
    assert.equal(modeOf(await stat(sessionDir)), 0o700);
    assert.equal(modeOf(await stat(databasePath)), 0o600);
    assert.equal(modeOf(await stat(storagePath)), 0o600);
    assert.equal(modeOf(await stat(envPath)), 0o600);
  } finally {
    process.umask(previousUmask);
  }
});

test("未配置会话路径时继续使用现存的旧版 CLI 会话", async () => {
  const root = await mkdtemp(join(tmpdir(), "fc-legacy-session-"));
  temporaryRoots.push(root);
  const legacyPath = join(
    root,
    ".config",
    "notebooklm-cli",
    "storage_state.json"
  );
  await mkdir(join(root, ".config", "notebooklm-cli"), { recursive: true });
  await writeFile(legacyPath, "legacy-session");

  assert.equal(resolveNotebookLMStoragePath(undefined, root), legacyPath);
});

test("新旧默认会话同时存在时优先使用新版 CLI 会话", async () => {
  const root = await mkdtemp(join(tmpdir(), "fc-current-session-"));
  temporaryRoots.push(root);
  const legacyPath = join(
    root,
    ".config",
    "notebooklm-cli",
    "storage_state.json"
  );
  const currentPath = join(
    root,
    ".config",
    "gemini-notebook-cli",
    "storage_state.json"
  );
  await mkdir(join(root, ".config", "notebooklm-cli"), { recursive: true });
  await mkdir(join(root, ".config", "gemini-notebook-cli"), {
    recursive: true,
  });
  await writeFile(legacyPath, "legacy-session");
  await writeFile(currentPath, "current-session");

  assert.equal(resolveNotebookLMStoragePath(undefined, root), currentPath);
});

test("显式配置的会话路径始终优先于默认目录", async () => {
  const root = await mkdtemp(join(tmpdir(), "fc-explicit-session-"));
  temporaryRoots.push(root);
  const configuredPath = join(root, "private", "storage_state.json");

  assert.equal(
    resolveNotebookLMStoragePath(configuredPath, root),
    configuredPath
  );
});

test("没有默认会话文件时使用新版 CLI 路径", async () => {
  const root = await mkdtemp(join(tmpdir(), "fc-empty-session-"));
  temporaryRoots.push(root);

  assert.equal(
    resolveNotebookLMStoragePath(undefined, root),
    join(
      root,
      ".config",
      "gemini-notebook-cli",
      "storage_state.json"
    )
  );
});
