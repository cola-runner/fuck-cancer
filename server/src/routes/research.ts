import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { cases, documents } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  withNotebookLM,
  isAuthError,
  NOTEBOOKLM_AUTH_HINT,
  RESEARCH_STEERING,
} from "../lib/notebooklm.js";
import { trackSourceProcessing } from "../lib/source-tracking.js";

// Structural twin of the CLI's ResearchSource (the type isn't re-exported from
// the package root). The frontend round-trips these between poll and import.
interface ResearchSourceInput {
  url: string;
  title: string;
  resultType: number | string;
  reportMarkdown?: string;
}

async function findOwnedCase(caseId: string, userId: string) {
  const [caseRecord] = await db
    .select()
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, userId)))
    .limit(1);

  return caseRecord ?? null;
}

/**
 * Web research, powered by NotebookLM's own "Discover sources" model. We only
 * supply the query; Google's model searches, and the user picks which results
 * to import into the case notebook as grounded sources.
 */
export async function researchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", authMiddleware);

  fastify.post<{
    Params: { id: string };
    Body: { query?: string; mode?: string };
  }>("/api/cases/:id/research", async (request, reply) => {
    const { id: caseId } = request.params;
    const query = request.body.query?.trim() || "";
    const mode = request.body.mode === "deep" ? "deep" : "fast";

    if (!query) {
      return reply.code(400).send({ error: "query is required" });
    }

    const caseRecord = await findOwnedCase(caseId, request.user.id);
    if (!caseRecord) {
      return reply.code(404).send({ error: "Case not found" });
    }
    if (!caseRecord.notebookId) {
      return reply.code(400).send({ error: "Case has no NotebookLM notebook." });
    }

    const notebookId = caseRecord.notebookId;
    try {
      const task = await withNotebookLM((client) =>
        client.research.start(notebookId, `${query} ${RESEARCH_STEERING}`, {
          mode,
        })
      );
      if (!task) {
        return reply
          .code(502)
          .send({ error: "NotebookLM rejected the research request." });
      }
      return reply
        .code(201)
        .send({ task: { taskId: task.taskId, query, mode } });
    } catch (err) {
      if (isAuthError(err)) {
        return reply.code(401).send({ error: NOTEBOOKLM_AUTH_HINT });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      fastify.log.error({ err }, "Failed to start NotebookLM research");
      return reply
        .code(502)
        .send({ error: `Failed to start research: ${message}` });
    }
  });

  fastify.get<{ Params: { id: string; taskId: string } }>(
    "/api/cases/:id/research/:taskId",
    async (request, reply) => {
      const { id: caseId, taskId } = request.params;

      const caseRecord = await findOwnedCase(caseId, request.user.id);
      if (!caseRecord) {
        return reply.code(404).send({ error: "Case not found" });
      }
      if (!caseRecord.notebookId) {
        return reply
          .code(400)
          .send({ error: "Case has no NotebookLM notebook." });
      }

      const notebookId = caseRecord.notebookId;
      try {
        const result = await withNotebookLM((client) =>
          client.research.poll(notebookId, taskId)
        );
        return reply.send({
          research: {
            status: result.status,
            summary: result.summary ?? "",
            sources: result.sources.map((s) => ({
              url: s.url,
              title: s.title,
              resultType: s.resultType,
              reportMarkdown: s.reportMarkdown,
            })),
          },
        });
      } catch (err) {
        if (isAuthError(err)) {
          return reply.code(401).send({ error: NOTEBOOKLM_AUTH_HINT });
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        fastify.log.error({ err }, "Failed to poll NotebookLM research");
        return reply
          .code(502)
          .send({ error: `Failed to poll research: ${message}` });
      }
    }
  );

  fastify.post<{
    Params: { id: string; taskId: string };
    Body: { sources?: ResearchSourceInput[] };
  }>("/api/cases/:id/research/:taskId/import", async (request, reply) => {
    const { id: caseId, taskId } = request.params;
    const selected = request.body.sources ?? [];

    if (selected.length === 0) {
      return reply.code(400).send({ error: "sources is required" });
    }

    const caseRecord = await findOwnedCase(caseId, request.user.id);
    if (!caseRecord) {
      return reply.code(404).send({ error: "Case not found" });
    }
    if (!caseRecord.notebookId) {
      return reply.code(400).send({ error: "Case has no NotebookLM notebook." });
    }

    const notebookId = caseRecord.notebookId;
    let imported: Array<{ id: string; title: string }>;
    try {
      imported = await withNotebookLM((client) =>
        client.research.importSources(
          notebookId,
          taskId,
          selected.map((s) => ({
            url: s.url ?? "",
            title: s.title ?? "",
            resultType: s.resultType ?? 1,
            reportMarkdown: s.reportMarkdown,
            researchTaskId: taskId,
          }))
        )
      );
    } catch (err) {
      if (isAuthError(err)) {
        return reply.code(401).send({ error: NOTEBOOKLM_AUTH_HINT });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      fastify.log.error({ err }, "Failed to import research sources");
      return reply
        .code(502)
        .send({ error: `Failed to import sources: ${message}` });
    }

    if (imported.length < selected.length) {
      fastify.log.warn(
        { requested: selected.length, imported: imported.length, taskId },
        "NotebookLM import returned fewer sources than requested"
      );
    }

    // Map titles back to the submitted entries to recover url / report body.
    const byTitle = new Map(selected.map((s) => [s.title, s]));
    const docs = [];
    for (const row of imported) {
      const origin = byTitle.get(row.title);
      const isReport = origin?.resultType === 5 || origin?.resultType === "report";
      const [doc] = await db
        .insert(documents)
        .values({
          caseId,
          sourceId: row.id,
          fileName: row.title || origin?.title || "网络资料",
          fileType: isReport ? "text/markdown" : "web",
          textContent: isReport ? origin?.reportMarkdown ?? null : null,
          sourceUrl: !isReport && origin?.url ? origin.url : null,
          origin: "research",
          sourceStatus: "processing",
          sourceError: null,
        })
        .returning();
      docs.push(doc);
      void trackSourceProcessing(
        doc.id,
        caseRecord.notebookId,
        row.id,
        fastify.log
      );
    }

    return reply.code(201).send({ documents: docs });
  });
}
