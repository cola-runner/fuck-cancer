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
} from "../lib/notebooklm.js";
import { trackSourceProcessing } from "../lib/source-tracking.js";
import { coverDrugsFromDocument } from "../lib/drug-coverage.js";
import {
  toNotebookLMError,
  toRemoteDeleteError,
} from "../lib/api-errors.js";
import { classifySourceAuthority } from "../lib/source-authority.js";

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
export interface TrackAndCoverOptions {
  trackSource?: typeof trackSourceProcessing;
  coverDrugs?: typeof coverDrugsFromDocument;
}

export async function trackAndCover(
  docId: string,
  caseId: string,
  notebookId: string,
  sourceId: string,
  logger: FastifyBaseLogger,
  options: TrackAndCoverOptions = {}
): Promise<void> {
  const trackSource = options.trackSource ?? trackSourceProcessing;
  const coverDrugs = options.coverDrugs ?? coverDrugsFromDocument;

  try {
    await db
      .update(documents)
      .set({ coverageStatus: "pending", coverageError: null })
      .where(eq(documents.id, docId));

    const sourceReady = await trackSource(
      docId,
      notebookId,
      sourceId,
      logger
    );
    if (!sourceReady) {
      await db
        .update(documents)
        .set({
          coverageStatus: "error",
          coverageError: "NotebookLM 资料处理失败，请重新检测或删除资料。",
        })
        .where(eq(documents.id, docId));
      return;
    }

    const covered = await coverDrugs(
      docId,
      caseId,
      notebookId,
      sourceId,
      logger
    );
    await db
      .update(documents)
      .set(
        covered
          ? { coverageStatus: "ready", coverageError: null }
          : {
              coverageStatus: "error",
              coverageError: "用药资料补充失败，请重新检测或删除资料。",
            }
      )
      .where(eq(documents.id, docId));
  } catch (err) {
    logger.warn({ err, docId }, "Document coverage tracking failed");
    await db
      .update(documents)
      .set({
        coverageStatus: "error",
        coverageError: "用药资料检测失败，请重新检测或删除资料。",
      })
      .where(eq(documents.id, docId))
      .catch((updateError) => {
        logger.error(
          { err: updateError, docId },
          "Failed to persist document coverage error"
        );
      });
  }
}

export async function documentsRoutes(
  fastify: FastifyInstance,
  options: {
    addTextSource?: (
      notebookId: string,
      title: string,
      content: string
    ) => Promise<{ id: string }>;
    deleteSource?: (
      notebookId: string,
      sourceId: string
    ) => Promise<boolean>;
  } = {}
): Promise<void> {
  fastify.addHook("preHandler", authMiddleware);
  const addTextSource =
    options.addTextSource ??
    ((notebookId: string, title: string, content: string) =>
      withNotebookLM((client) =>
        client.sources.addText(notebookId, title, content)
      ));
  const deleteSource =
    options.deleteSource ??
    ((notebookId: string, sourceId: string) =>
      withNotebookLM((client) =>
        client.sources.delete(notebookId, sourceId)
      ));

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
      fastify.log.error({ err }, "Failed to add file source to NotebookLM");
      const mapped = toNotebookLMError(err);
      return reply.code(mapped.statusCode).send(mapped.body);
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
        coverageStatus: "pending",
        coverageError: null,
      })
      .returning();

    void trackAndCover(
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
      source = await addTextSource(notebookId, title, content);
    } catch (err) {
      fastify.log.error({ err }, "Failed to add text source to NotebookLM");
      const mapped = toNotebookLMError(err);
      return reply.code(mapped.statusCode).send(mapped.body);
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
        coverageStatus: "pending",
        coverageError: null,
      })
      .returning();

    void trackAndCover(
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

      return reply.send({
        documents: docs.map((document) => ({
          ...document,
          sourceAuthority: classifySourceAuthority(
            document.origin,
            document.sourceUrl
          ),
        })),
      });
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
          void trackAndCover(
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
          origin: documents.origin,
          sourceStatus: documents.sourceStatus,
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

      // A ready auto source is tied to a durable case_drugs de-duplication
      // record. Until that relationship is stored explicitly, deleting it
      // would prevent the drug from ever being imported again. Processing and
      // failed auto sources have no durable claim and remain recoverable.
      if (doc.origin === "auto" && doc.sourceStatus === "ready") {
        return reply.code(409).send({
          code: "MANAGED_AUTO_SOURCE",
          error: "自动补充的用药资料由系统管理，暂不能单独删除。",
        });
      }

      if (doc.notebookId && doc.sourceId) {
        const notebookId = doc.notebookId;
        const sourceId = doc.sourceId;
        try {
          const deleted = await deleteSource(notebookId, sourceId);
          if (!deleted) {
            const mapped = toRemoteDeleteError();
            return reply.code(mapped.statusCode).send(mapped.body);
          }
        } catch (err) {
          fastify.log.error(
            { err, docId },
            "Failed to delete source from NotebookLM"
          );
          const mapped = toRemoteDeleteError(err);
          return reply.code(mapped.statusCode).send(mapped.body);
        }
      }

      await db.delete(documents).where(eq(documents.id, docId));

      return reply.send({ success: true });
    }
  );
}
