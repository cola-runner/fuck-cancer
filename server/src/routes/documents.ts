import type { MultipartFile } from "@fastify/multipart";
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { and, eq } from "drizzle-orm";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { cases, documents } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  withNotebookLM,
  isAuthError,
  NOTEBOOKLM_AUTH_HINT,
} from "../lib/notebooklm.js";
import { trackSourceProcessing } from "../lib/source-tracking.js";
import { coverDrugsFromDocument } from "../lib/drug-coverage.js";

type UploadRequest = FastifyRequest<{ Params: { id: string } }> & {
  file: () => Promise<MultipartFile | undefined>;
};

async function findOwnedCase(caseId: string, userId: string) {
  const [caseRecord] = await db
    .select()
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, userId)))
    .limit(1);

  return caseRecord ?? null;
}

/**
 * Track processing of a user-provided document, then run the drug-coverage
 * pipeline on it once ready (auto/research imports never re-enter here, so
 * imported leaflets can't cascade further imports).
 */
function trackAndCover(
  docId: string,
  caseId: string,
  notebookId: string,
  sourceId: string,
  logger: FastifyBaseLogger
): void {
  void trackSourceProcessing(docId, notebookId, sourceId, logger).then(
    (ready) => {
      if (ready) {
        void coverDrugsFromDocument(docId, caseId, notebookId, sourceId, logger);
      }
    }
  );
}

export async function documentsRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.addHook("preHandler", authMiddleware);

  const handleBinaryUpload = async (
    request: UploadRequest,
    reply: FastifyReply
  ) => {
    const { id: caseId } = request.params;
    const caseRecord = await findOwnedCase(caseId, request.user.id);

    if (!caseRecord) {
      return reply.code(404).send({ error: "Case not found" });
    }

    if (!caseRecord.notebookId) {
      return reply
        .code(400)
        .send({ error: "Case has no NotebookLM notebook." });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "No file uploaded" });
    }

    const fileBuffer = await data.toBuffer();
    const fileName = data.filename;
    const mimeType = data.mimetype;

    // addFile takes a path on disk, so stage the upload to a temp file. Keep the
    // original extension — NotebookLM's upload handshake keys off it.
    const tmpPath = join(
      tmpdir(),
      `fc-${randomUUID()}${extname(fileName) || ""}`
    );

    const notebookId = caseRecord.notebookId;
    let source;
    try {
      await writeFile(tmpPath, fileBuffer);
      source = await withNotebookLM((client) =>
        client.sources.addFile(notebookId, tmpPath, { mime: mimeType })
      );
    } catch (err) {
      if (isAuthError(err)) {
        return reply.code(401).send({ error: NOTEBOOKLM_AUTH_HINT });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      fastify.log.error({ err }, "Failed to add file source to NotebookLM");
      return reply
        .code(502)
        .send({ error: `Failed to add source to NotebookLM: ${message}` });
    } finally {
      await unlink(tmpPath).catch(() => {});
    }

    const [doc] = await db
      .insert(documents)
      .values({
        caseId,
        sourceId: source.id,
        fileName,
        fileType: mimeType,
        textContent: null,
        sourceStatus: "processing",
        sourceError: null,
      })
      .returning();

    trackAndCover(
      doc.id,
      caseId,
      caseRecord.notebookId,
      source.id,
      fastify.log
    );

    return reply.code(201).send({ document: doc });
  };

  fastify.post<{ Params: { id: string } }>(
    "/api/cases/:id/documents",
    handleBinaryUpload
  );

  fastify.post<{ Params: { id: string } }>(
    "/api/cases/:id/documents/upload",
    handleBinaryUpload
  );

  fastify.post<{
    Params: { id: string };
    Body: { title?: string; content?: string };
  }>("/api/cases/:id/documents/text", async (request, reply) => {
    const { id: caseId } = request.params;
    const title = request.body.title?.trim() || "文本记录";
    const content = request.body.content?.trim() || "";
    const caseRecord = await findOwnedCase(caseId, request.user.id);

    if (!content) {
      return reply.code(400).send({ error: "content is required" });
    }

    if (!caseRecord) {
      return reply.code(404).send({ error: "Case not found" });
    }

    if (!caseRecord.notebookId) {
      return reply
        .code(400)
        .send({ error: "Case has no NotebookLM notebook." });
    }

    const notebookId = caseRecord.notebookId;
    let source;
    try {
      source = await withNotebookLM((client) =>
        client.sources.addText(notebookId, title, content)
      );
    } catch (err) {
      if (isAuthError(err)) {
        return reply.code(401).send({ error: NOTEBOOKLM_AUTH_HINT });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      fastify.log.error({ err }, "Failed to add text source to NotebookLM");
      return reply
        .code(502)
        .send({ error: `Failed to add source to NotebookLM: ${message}` });
    }

    const [doc] = await db
      .insert(documents)
      .values({
        caseId,
        sourceId: source.id,
        fileName: title,
        fileType: "text/plain",
        textContent: content,
        sourceStatus: "processing",
        sourceError: null,
      })
      .returning();

    trackAndCover(
      doc.id,
      caseId,
      caseRecord.notebookId,
      source.id,
      fastify.log
    );

    return reply.code(201).send({ document: doc });
  });

  fastify.get<{ Params: { id: string } }>(
    "/api/cases/:id/documents",
    async (request, reply) => {
      const { id: caseId } = request.params;
      const caseRecord = await findOwnedCase(caseId, request.user.id);

      if (!caseRecord) {
        return reply.code(404).send({ error: "Case not found" });
      }

      const docs = await db
        .select()
        .from(documents)
        .where(eq(documents.caseId, caseId))
        .orderBy(documents.createdAt);

      return reply.send({ documents: docs });
    }
  );

  // Re-check the NotebookLM processing status of a single document.
  fastify.post<{ Params: { id: string } }>(
    "/api/documents/:id/refresh",
    async (request, reply) => {
      const { id: docId } = request.params;

      const [doc] = await db
        .select({
          id: documents.id,
          caseId: documents.caseId,
          sourceId: documents.sourceId,
          origin: documents.origin,
          notebookId: cases.notebookId,
          caseUserId: cases.userId,
        })
        .from(documents)
        .innerJoin(cases, eq(documents.caseId, cases.id))
        .where(eq(documents.id, docId))
        .limit(1);

      if (!doc || doc.caseUserId !== request.user.id) {
        return reply.code(404).send({ error: "Document not found" });
      }

      if (doc.notebookId && doc.sourceId) {
        if (doc.origin === null) {
          trackAndCover(
            doc.id,
            doc.caseId,
            doc.notebookId,
            doc.sourceId,
            fastify.log
          );
        } else {
          void trackSourceProcessing(
            doc.id,
            doc.notebookId,
            doc.sourceId,
            fastify.log
          );
        }
      }

      const [updatedDoc] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, docId))
        .limit(1);

      return reply.send({ document: updatedDoc });
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/api/documents/:id",
    async (request, reply) => {
      const { id: docId } = request.params;

      const [doc] = await db
        .select({
          docId: documents.id,
          sourceId: documents.sourceId,
          notebookId: cases.notebookId,
          caseUserId: cases.userId,
        })
        .from(documents)
        .innerJoin(cases, eq(documents.caseId, cases.id))
        .where(eq(documents.id, docId))
        .limit(1);

      if (!doc || doc.caseUserId !== request.user.id) {
        return reply.code(404).send({ error: "Document not found" });
      }

      if (doc.notebookId && doc.sourceId) {
        const notebookId = doc.notebookId;
        const sourceId = doc.sourceId;
        try {
          await withNotebookLM((client) =>
            client.sources.delete(notebookId, sourceId)
          );
        } catch (err) {
          fastify.log.warn(
            { err, docId },
            "Failed to delete source from NotebookLM"
          );
        }
      }

      await db.delete(documents).where(eq(documents.id, docId));

      return reply.send({ success: true });
    }
  );
}
