import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, matchesGlob, resolve } from "node:path";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");

function readRepositoryFile(relativePath: string): string {
  const absolutePath = resolve(repositoryRoot, relativePath);
  assert.equal(existsSync(absolutePath), true, `${relativePath} must exist`);
  return readFileSync(absolutePath, "utf8");
}

function dockerIgnoreRules(relativePath: string): string[] {
  return readRepositoryFile(relativePath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function ruleMatchesPath(rule: string, candidate: string): boolean {
  const normalizedRule = rule.replace(/^\/+|\/+$/g, "");
  const normalizedCandidate = candidate.replace(/^\/+|\/+$/g, "");
  const candidateParts = normalizedCandidate.split("/");
  const candidatePrefixes = candidateParts.map((_, index) =>
    candidateParts.slice(0, index + 1).join("/")
  );

  return candidatePrefixes.some((prefix) => {
    if (matchesGlob(prefix, normalizedRule)) return true;
    if (normalizedRule.includes("/")) return false;
    return matchesGlob(prefix.split("/").at(-1) ?? "", normalizedRule);
  });
}

function isExcluded(rules: string[], candidate: string): boolean {
  let excluded = false;
  for (const rawRule of rules) {
    const negated = rawRule.startsWith("!");
    const rule = negated ? rawRule.slice(1) : rawRule;
    if (ruleMatchesPath(rule, candidate)) {
      excluded = !negated;
    }
  }
  return excluded;
}

function locationBlock(config: string, location: string): string {
  const locationStart = config.search(
    new RegExp(`location\\s+${location.replace("/", "\\/")}\\s*\\{`)
  );
  assert.ok(locationStart >= 0, `${location} location must exist`);

  const openingBrace = config.indexOf("{", locationStart);
  let depth = 0;
  for (let index = openingBrace; index < config.length; index += 1) {
    if (config[index] === "{") depth += 1;
    if (config[index] === "}") depth -= 1;
    if (depth === 0) return config.slice(openingBrace + 1, index);
  }
  return "";
}

function composeServiceBlock(config: string, service: string): string {
  const lines = config.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${service}:`);
  assert.ok(start >= 0, `${service} service must exist`);

  const end = lines.findIndex(
    (line, index) => index > start && /^  [a-zA-Z0-9_-]+:\s*$/.test(line)
  );
  return lines.slice(start, end >= 0 ? end : undefined).join("\n");
}

function permissionMode(path: string): number {
  return statSync(path).mode & 0o777;
}

test("Docker contexts exclude secrets, medical data, and generated files", () => {
  const privateOrGeneratedPaths = [
    ".env",
    ".env.production",
    ".envrc",
    "node_modules/dependency/index.js",
    "dist/index.js",
    "data/fuckcancer.db",
    "data/fuckcancer.db-wal",
    "backup.sqlite",
    "storage_state.json",
    ".config/gemini-notebook-cli/storage_state.json",
    "coverage/lcov.info",
    "server.log",
    ".git/config",
    ".superpowers/session.json",
  ];

  for (const ignorePath of ["server/.dockerignore", "web/.dockerignore"]) {
    const rules = dockerIgnoreRules(ignorePath);
    for (const candidate of privateOrGeneratedPaths) {
      assert.equal(
        isExcluded(rules, candidate),
        true,
        `${ignorePath} must exclude ${candidate}`
      );
    }
    assert.equal(isExcluded(rules, "Dockerfile"), false);
    assert.equal(isExcluded(rules, "package.json"), false);
    assert.equal(isExcluded(rules, "src/index.ts"), false);
  }
});

test("server image excludes development dependencies from runtime", () => {
  const dockerfile = readRepositoryFile("server/Dockerfile");
  assert.equal(
    dockerfile.match(/^FROM\s+node:24-alpine/gm)?.length ?? 0,
    3
  );
  assert.match(
    dockerfile,
    /apk\s+add\s+--no-cache\s+(?=.*python3)(?=.*make)(?=.*g\+\+)/
  );
  assert.match(dockerfile, /npm\s+prune\s+--omit=dev/);
  assert.doesNotMatch(dockerfile, /^COPY\s+\.\s+\.$/m);
  assert.match(dockerfile, /apk\s+add\s+--no-cache\s+su-exec/);
  assert.match(
    dockerfile,
    /ENTRYPOINT\s+\["\/usr\/local\/bin\/docker-entrypoint\.sh"\]/
  );
});

test("server entrypoint makes persisted state private and preserves atomic session writes", (t) => {
  const entrypoint = resolve(repositoryRoot, "server/docker-entrypoint.sh");
  assert.equal(existsSync(entrypoint), true, "server entrypoint must exist");

  const fixtureRoot = mkdtempSync(join(tmpdir(), "fc-entrypoint-"));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  const dataDir = join(fixtureRoot, "data");
  const nestedDataDir = join(dataDir, "nested");
  const sessionDir = join(fixtureRoot, "session");
  const storagePath = join(sessionDir, "storage_state.json");
  const outsideFile = join(fixtureRoot, "outside.txt");
  const linkedFile = join(sessionDir, "outside-link");
  const createdDataFile = join(nestedDataDir, "created.db");

  mkdirSync(nestedDataDir, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(nestedDataDir, "existing.db"), "db");
  writeFileSync(storagePath, "{}");
  writeFileSync(outsideFile, "outside");
  symlinkSync(outsideFile, linkedFile);

  chmodSync(dataDir, 0o755);
  chmodSync(nestedDataDir, 0o755);
  chmodSync(sessionDir, 0o755);
  chmodSync(join(nestedDataDir, "existing.db"), 0o644);
  chmodSync(storagePath, 0o644);
  chmodSync(outsideFile, 0o644);

  const childProgram = `
    const { renameSync, writeFileSync } = require("node:fs");
    writeFileSync(process.env.CREATED_DATA_FILE, "new");
    const temporaryState = process.env.NOTEBOOKLM_STORAGE_PATH + ".tmp-test";
    writeFileSync(temporaryState, "{\\"cookies\\":[]}");
    renameSync(temporaryState, process.env.NOTEBOOKLM_STORAGE_PATH);
  `;
  const result = spawnSync(
    entrypoint,
    [process.execPath, "-e", childProgram],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        APP_DATA_DIR: dataDir,
        NOTEBOOKLM_SESSION_DIR: sessionDir,
        NOTEBOOKLM_STORAGE_PATH: storagePath,
        CREATED_DATA_FILE: createdDataFile,
      },
    }
  );

  assert.equal(
    result.status,
    0,
    `entrypoint failed:\n${result.stderr || result.error?.message || ""}`
  );
  assert.equal(permissionMode(dataDir), 0o700);
  assert.equal(permissionMode(nestedDataDir), 0o700);
  assert.equal(permissionMode(sessionDir), 0o700);
  assert.equal(permissionMode(join(nestedDataDir, "existing.db")), 0o600);
  assert.equal(permissionMode(createdDataFile), 0o600);
  assert.equal(permissionMode(storagePath), 0o600);
  assert.equal(
    permissionMode(outsideFile),
    0o644,
    "entrypoint must not follow links outside the private directories"
  );
});

test("Compose keeps the API internal and mounts only a dedicated session directory", () => {
  const compose = readRepositoryFile("docker-compose.yml");
  const server = composeServiceBlock(compose, "server");
  const web = composeServiceBlock(compose, "web");

  assert.doesNotMatch(server, /^    ports:\s*$/m);
  assert.match(server, /^    expose:\s*\n      - "3000"\s*$/m);
  assert.match(web, /- "127\.0\.0\.1:5173:80"/);
  assert.doesNotMatch(
    compose,
    /\$\{HOME\}|\.config\/(?:gemini-notebook-cli|notebooklm-cli)/
  );
  assert.match(
    server,
    /NOTEBOOKLM_STORAGE_PATH:\s*\/app\/notebooklm-session\/storage_state\.json/
  );
  assert.match(
    server,
    /- \.\/server\/notebooklm-session:\/app\/notebooklm-session/
  );
});

test("environment example uses the same-origin callback and dedicated session jar", () => {
  const example = readRepositoryFile("server/.env.example");

  assert.match(
    example,
    /^GOOGLE_REDIRECT_URI=http:\/\/localhost:5173\/api\/auth\/google\/callback$/m
  );
  assert.match(example, /^OWNER_EMAIL=$/m);
  assert.match(
    example,
    /^NOTEBOOKLM_STORAGE_PATH=\.\/notebooklm-session\/storage_state\.json$/m
  );
  assert.doesNotMatch(
    example,
    /\.config\/(?:gemini-notebook-cli|notebooklm-cli)/
  );
});

test("operator setup uses the published Gemini Notebook CLI", () => {
  const packageJson = JSON.parse(readRepositoryFile("server/package.json")) as {
    dependencies: Record<string, string>;
  };
  assert.equal(
    packageJson.dependencies["@cola_runner/gemini-notebook-cli"],
    "0.2.1"
  );
  assert.equal(
    Object.hasOwn(packageJson.dependencies, "@cola_runner/notebooklm-cli"),
    false
  );

  for (const relativePath of [
    "README.md",
    "server/.env.example",
    "server/src/lib/file-security.ts",
    "server/src/lib/notebooklm.ts",
    "server/src/routes/settings.ts",
    "web/src/pages/SettingsPage.tsx",
  ]) {
    const content = readRepositoryFile(relativePath);
    assert.doesNotMatch(content, /@cola_runner\/notebooklm-cli/);
    assert.doesNotMatch(content, /`notebooklm login/);
  }

  for (const relativePath of [
    "server/.env.example",
    "server/src/lib/notebooklm.ts",
    "server/src/routes/settings.ts",
    "web/src/pages/SettingsPage.tsx",
  ]) {
    assert.match(readRepositoryFile(relativePath), /\bgemini-notebook login\b/);
  }
});

test("operator setup verifies the live Notebook session instead of cookie shape", () => {
  const readme = readRepositoryFile("README.md");

  assert.match(readme, /\bgemini-notebook list\b/);
  assert.doesNotMatch(readme, /\bgemini-notebook status\b/);
});

test("project-local NotebookLM session files are ignored by Git", () => {
  const result = spawnSync(
    "git",
    ["check-ignore", "--quiet", "server/notebooklm-session/storage_state.json"],
    { cwd: repositoryRoot }
  );
  assert.equal(result.status, 0);
});

test("web image builds with the supported Node runtime", () => {
  const dockerfile = readRepositoryFile("web/Dockerfile");
  assert.match(dockerfile, /^FROM\s+node:24-alpine\s+AS\s+build$/m);
});

test("Nginx streams bounded uploads and disables API caching", () => {
  const config = readRepositoryFile("web/nginx.conf");
  const apiLocation = locationBlock(config, "/api");

  assert.match(config, /client_max_body_size\s+64m\s*;/);
  assert.match(apiLocation, /proxy_request_buffering\s+off\s*;/);
  assert.match(apiLocation, /proxy_read_timeout\s+600s\s*;/);
  assert.match(apiLocation, /proxy_send_timeout\s+600s\s*;/);
  assert.match(
    apiLocation,
    /proxy_set_header\s+X-Forwarded-Host\s+\$host\s*;/
  );
  assert.match(
    apiLocation,
    /proxy_set_header\s+X-Forwarded-Proto\s+\$scheme\s*;/
  );
  assert.match(
    apiLocation,
    /add_header\s+Cache-Control\s+"no-store"\s+always\s*;/
  );
  assert.match(
    config,
    /location\s+=\s+\/auth\/callback\s*\{[^}]*add_header\s+Cache-Control\s+"no-store"\s+always\s*;[^}]*\}/s
  );
});

test("temporary upload storage is capped", () => {
  const compose = readRepositoryFile("docker-compose.yml");
  assert.match(
    compose,
    /\/tmp:size=(?:536870912|512m|512M|512MiB),uid=1000,gid=1000,mode=0700/
  );
});
