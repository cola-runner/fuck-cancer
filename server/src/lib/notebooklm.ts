import {
  AuthError,
  GeminiNotebookClient,
} from "@cola_runner/gemini-notebook-cli";
import { config } from "./config.js";

/**
 * Single, process-wide NotebookLM session.
 *
 * The whole self-hosted server talks to one NotebookLM account (the operator's),
 * authenticated by the cookie jar at `storage_state.json`. We keep a single
 * long-lived client so its keepalive (RotateCookies) can refresh the session and
 * persist rotated cookies back to disk — do NOT use `readOnlyStorage` here.
 *
 * The session is created lazily on first use and cached. If the cookies are
 * missing/expired the client throws `AuthError`; callers surface that as a
 * "run `gemini-notebook login`" hint rather than a 500.
 */
interface NotebookLMClientEntry {
  promise: Promise<GeminiNotebookClient>;
}

let clientEntry: NotebookLMClientEntry | null = null;
let saveTail: Promise<void> = Promise.resolve();

function persistNotebookLMSession(
  client: GeminiNotebookClient,
  entry: NotebookLMClientEntry
): Promise<void> {
  const save = saveTail.catch(() => undefined).then(async () => {
    if (entry !== clientEntry) return;
    try {
      await client.save();
    } catch {
      console.error(
        "Notebook session remains usable in memory, but rotated cookies could not be saved. Check storage permissions and free disk space."
      );
    }
  });
  saveTail = save;
  return save;
}

function getNotebookLMEntry(): NotebookLMClientEntry {
  if (!clientEntry) {
    const entry = {} as NotebookLMClientEntry;
    entry.promise = GeminiNotebookClient.fromStorage({
      // Config prefers the current default and reuses the legacy CLI path on upgrades.
      storagePath: config.notebooklmStoragePath,
    }).catch((err) => {
      if (clientEntry === entry) {
        // Don't cache a failed bootstrap — let the next request retry once the
        // operator has logged in.
        clientEntry = null;
      }
      throw err;
    });
    clientEntry = entry;
  }
  return clientEntry;
}

export function getNotebookLM(): Promise<GeminiNotebookClient> {
  return getNotebookLMEntry().promise;
}

function resetNotebookLMEntry(entry: NotebookLMClientEntry): void {
  if (clientEntry === entry) clientEntry = null;
}

/**
 * Drop the cached client so the next getNotebookLM() rebuilds it from disk.
 *
 * The cookie jar (storage_state.json) is refreshed out-of-band when the operator
 * re-runs `gemini-notebook login`. But a client reads those cookies into memory once,
 * at construction — so a client built from an expired jar keeps failing with
 * AuthError even after a successful re-login. Resetting forces a fresh read.
 */
export function resetNotebookLM(): void {
  clientEntry = null;
}

/** True when the failure is an expired/missing NotebookLM session. */
export function isAuthError(err: unknown): boolean {
  return err instanceof AuthError;
}

/**
 * Run an operation against the shared NotebookLM client, self-healing the
 * cached session on auth failure. On AuthError we drop the cached client and
 * retry once with a freshly-loaded one — so the first request after the operator
 * re-logs-in recovers transparently, with no server restart. AuthError is raised
 * during session/token setup, before the RPC executes, so the retry does not
 * double-run the operation.
 */
export async function withNotebookLM<T>(
  op: (client: GeminiNotebookClient) => Promise<T>
): Promise<T> {
  const entry = getNotebookLMEntry();
  try {
    const client = await entry.promise;
    const result = await op(client);
    await persistNotebookLMSession(client, entry);
    return result;
  } catch (err) {
    if (!isAuthError(err)) throw err;
    resetNotebookLMEntry(entry);
    const retryEntry = getNotebookLMEntry();
    try {
      const client = await retryEntry.promise;
      const result = await op(client);
      await persistNotebookLMSession(client, retryEntry);
      return result;
    } catch (retryErr) {
      // Still dead (operator hasn't re-logged-in yet) — clear the cache so the
      // next attempt re-reads disk too, and surface the auth failure.
      if (isAuthError(retryErr)) resetNotebookLMEntry(retryEntry);
      throw retryErr;
    }
  }
}

export async function refreshNotebookLMSession(): Promise<void> {
  await withNotebookLM(async (client) => {
    await client.session.refreshTokens();
  });
}

/**
 * Actively verify the session with a cheap RPC. Constructing the client only
 * reads cookies offline and cannot tell a live session from a dead one, so the
 * health check must make a real call. Resets the cache on AuthError so a later
 * re-login heals on the next use.
 */
export async function isNotebookLMConnected(): Promise<boolean> {
  try {
    await withNotebookLM((client) => client.notebooks.list());
    return true;
  } catch {
    return false;
  }
}

export const NOTEBOOKLM_AUTH_HINT =
  "NotebookLM session is missing or expired. On the server host rerun `npx --package=@cola_runner/gemini-notebook-cli@0.2.1 gemini-notebook login --paste --storage <NOTEBOOKLM_STORAGE_PATH>`.";

// Appended to every research query (manual search and the auto drug-coverage
// pipeline). The research model itself judges which authoritative sources fit
// the query — drug queries surface DailyMed/FDA labels and trials, care
// queries surface hospital/guideline pages — so the UI needs no toggle.
export const RESEARCH_STEERING =
  "(优先权威医学来源:FDA/DailyMed 官方药品说明书、ClinicalTrials.gov 临床试验、权威诊疗指南、PubMed 文献;同时兼顾适合患者家属阅读的中文资料)";
