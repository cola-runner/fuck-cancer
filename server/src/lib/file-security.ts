import {
  chmodSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import {
  dirname,
  join,
  parse,
  resolve,
} from "node:path";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export function resolveNotebookLMStoragePath(
  configuredPath: string | undefined,
  homeDirectory = homedir()
): string {
  if (configuredPath) return configuredPath;
  const currentPath = join(
    homeDirectory,
    ".config",
    "gemini-notebook-cli",
    "storage_state.json"
  );
  if (existsSync(currentPath)) return currentPath;
  const legacyPath = join(
    homeDirectory,
    ".config",
    "notebooklm-cli",
    "storage_state.json"
  );
  if (existsSync(legacyPath)) return legacyPath;
  return currentPath;
}

function isMemoryDatabase(path: string): boolean {
  return path === ":memory:";
}

function chmodIfPresent(path: string, mode: number): void {
  if (existsSync(path)) chmodSync(path, mode);
}

function mayHardenDirectory(path: string): boolean {
  const resolved = resolve(path);
  return !new Set([
    parse(resolved).root,
    resolve(process.cwd()),
    resolve(homedir()),
    resolve(tmpdir()),
  ]).has(resolved);
}

/**
 * Prepare a dedicated parent directory and restrict an existing sensitive
 * file. Shared directories such as /tmp, HOME, and the repository root are
 * never chmodded.
 */
export function preparePrivateFile(path: string): void {
  if (isMemoryDatabase(path)) return;

  const absolutePath = resolve(path);
  const parent = dirname(absolutePath);
  mkdirSync(parent, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  if (mayHardenDirectory(parent)) {
    chmodSync(parent, PRIVATE_DIRECTORY_MODE);
  }
  chmodIfPresent(absolutePath, PRIVATE_FILE_MODE);
}

export interface RuntimePermissionPaths {
  databasePath: string;
  notebooklmStoragePath?: string;
  envPath?: string;
}

export function hardenRuntimePermissions(
  paths: RuntimePermissionPaths
): void {
  process.umask(0o077);

  preparePrivateFile(paths.databasePath);
  preparePrivateFile(
    paths.notebooklmStoragePath ??
      join(homedir(), ".config", "gemini-notebook-cli", "storage_state.json")
  );
  chmodIfPresent(
    resolve(paths.envPath ?? join(process.cwd(), ".env")),
    PRIVATE_FILE_MODE
  );
}
