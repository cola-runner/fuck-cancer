import type { FastifyBaseLogger } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { documents } from "../db/schema.js";
import { withNotebookLM } from "./notebooklm.js";

/**
 * Poll a freshly-added source until NotebookLM finishes processing it, then
 * flip the document row to ready/error. Fire-and-forget from route handlers —
 * the response returns immediately with status "processing". Resolves true
 * when the source became ready.
 */
export async function trackSourceProcessing(
  docId: string,
  notebookId: string,
  sourceId: string,
  logger: FastifyBaseLogger
): Promise<boolean> {
  try {
    await withNotebookLM((client) =>
      client.sources.waitUntilReady(notebookId, sourceId, {
        timeoutMs: 5 * 60 * 1000,
      })
    );
    await db
      .update(documents)
      .set({ sourceStatus: "ready", sourceError: null })
      .where(eq(documents.id, docId));
    return true;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Source processing failed";
    await db
      .update(documents)
      .set({ sourceStatus: "error", sourceError: message })
      .where(eq(documents.id, docId));
    logger.warn({ err, docId }, "NotebookLM source processing failed");
    return false;
  }
}
