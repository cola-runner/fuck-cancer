import type { MultipartFile } from "@fastify/multipart";
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { cases, documents } from "../db/schema.js";
import { decrypt } from "../lib/encryption.js";
import { GoogleDriveService } from "../lib/google-drive.js";
import { createLLMProvider } from "../lib/llm.js";
import { authMiddleware } from "../middleware/auth.js";

const ANALYSIS_PROMPT = `You are a medical document analyzer. Analyze this medical document image and extract:

1. **Document Type**: (e.g., lab report, imaging report, pathology report, prescription, clinical notes, insurance document)
2. **Date**: The date on the document if visible
3. **Summary**: A concise 2-3 sentence summary of key findings
4. **Key Values**: Any important lab values, measurements, or results
5. **Category**: One of: lab_report, imaging, pathology, prescription, clinical_notes, insurance, other

Respond in JSON format:
{
  "documentType": "...",
  "date": "YYYY-MM-DD or null",
  "summary": "...",
  "keyValues": { "key": "value" },
  "category": "..."
}`;

type AnalysisStatus =
  | "not_requested"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

type UploadRequest = FastifyRequest<{ Params: { id: string } }> & {
  file: () => Promise<MultipartFile | undefined>;
};

function getAnalysisPlan(
  mimeType: string,
  llmProvider: string | null,
  hasLlmKey: boolean
): {
  shouldAnalyze: boolean;
  status: AnalysisStatus;
  reason: string | null;
} {
  if (!mimeType.startsWith("image/") && mimeType !== "application/pdf") {
    return {
      shouldAnalyze: false,
      status: "not_requested",
      reason: "当前文件类型暂不支持自动分析",
    };
  }

  if (!llmProvider || !hasLlmKey) {
    return {
      shouldAnalyze: false,
      status: "not_requested",
      reason: "配置 AI Provider 和 API Key 后可自动分析",
    };
  }

  if (mimeType === "application/pdf" && llmProvider !== "gemini") {
    return {
      shouldAnalyze: false,
      status: "not_requested",
      reason: "当前仅 Gemini 支持 PDF 自动分析",
    };
  }

  return {
    shouldAnalyze: true,
    status: "queued",
    reason: null,
  };
}

function summarizeTextContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

async function findOwnedCase(caseId: string, userId: string) {
  const [caseRecord] = await db
    .select()
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, userId)))
    .limit(1);

  return caseRecord ?? null;
}

async function markDocumentQueued(docId: string): Promise<void> {
  await db
    .update(documents)
    .set({
      analysisStatus: "queued",
      analysisError: null,
      analysisStartedAt: null,
      analysisCompletedAt: null,
    })
    .where(eq(documents.id, docId));
}

async function analyzeDocumentAsync(
  docId: string,
  fileBuffer: Buffer,
  mimeType: string,
  providerName: string,
  apiKey: string,
  logger: FastifyBaseLogger
): Promise<void> {
  try {
    await db
      .update(documents)
      .set({
        analysisStatus: "processing",
        analysisError: null,
        analysisStartedAt: new Date(),
        analysisCompletedAt: null,
      })
      .where(eq(documents.id, docId));

    const provider = createLLMProvider(providerName, apiKey);
    const base64 = fileBuffer.toString("base64");
    const rawResponse = await provider.analyzeImage(base64, mimeType, ANALYSIS_PROMPT);

    let parsed: {
      documentType?: string;
      date?: string | null;
      summary?: string;
      keyValues?: Record<string, string>;
      category?: string;
    };

    try {
      const cleaned = rawResponse
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { summary: rawResponse, category: "other" };
    }

    await db
      .update(documents)
      .set({
        category: parsed.category || null,
        docDate: parsed.date || null,
        aiSummary: parsed.summary || null,
        aiMetadata: parsed.keyValues
          ? { ...parsed.keyValues, documentType: parsed.documentType }
          : null,
        analysisStatus: "completed",
        analysisError: null,
        analysisCompletedAt: new Date(),
      })
      .where(eq(documents.id, docId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown analysis error";
    await db
      .update(documents)
      .set({
        analysisStatus: "failed",
        analysisError: message,
        analysisCompletedAt: new Date(),
      })
      .where(eq(documents.id, docId));
    logger.error({ err: error, docId }, "Document analysis failed");
  }
}

async function reanalyzeDocumentFromDrive(
  docId: string,
  driveFileId: string,
  encryptedGoogleToken: string,
  providerName: string,
  apiKey: string,
  logger: FastifyBaseLogger
): Promise<void> {
  try {
    const tokens = JSON.parse(decrypt(encryptedGoogleToken));
    const driveService = new GoogleDriveService(tokens);
    const file = await driveService.getFile(driveFileId);

    await analyzeDocumentAsync(
      docId,
      file.content,
      file.metadata.mimeType || "application/octet-stream",
      providerName,
      apiKey,
      logger
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load document from Google Drive";
    await db
      .update(documents)
      .set({
        analysisStatus: "failed",
        analysisError: message,
        analysisCompletedAt: new Date(),
      })
      .where(eq(documents.id, docId));
    logger.error({ err: error, docId }, "Document re-analysis bootstrap failed");
  }
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

    if (!caseRecord.driveFolderId) {
      return reply
        .code(400)
        .send({ error: "Case has no Google Drive folder. Reconnect Google Drive." });
    }

    if (!request.user.googleToken) {
      return reply
        .code(400)
        .send({ error: "Google Drive not connected. Please re-authenticate." });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "No file uploaded" });
    }

    const fileBuffer = await data.toBuffer();
    const fileName = data.filename;
    const mimeType = data.mimetype;

    let driveFile;
    try {
      const tokens = JSON.parse(decrypt(request.user.googleToken));
      const driveService = new GoogleDriveService(tokens);
      driveFile = await driveService.uploadFile(
        fileName,
        mimeType,
        fileBuffer,
        caseRecord.driveFolderId
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply
        .code(500)
        .send({ error: `Failed to upload to Google Drive: ${message}` });
    }

    const analysisPlan = getAnalysisPlan(
      mimeType,
      request.user.llmProvider,
      !!request.user.llmApiKey
    );

    const [doc] = await db
      .insert(documents)
      .values({
        caseId,
        driveFileId: driveFile.id,
        fileName: driveFile.name,
        fileType: mimeType,
        category: null,
        docDate: null,
        ocrText: null,
        aiSummary: null,
        aiMetadata: null,
        analysisStatus: analysisPlan.status,
        analysisError: analysisPlan.reason,
        analysisStartedAt: null,
        analysisCompletedAt: null,
      })
      .returning();

    if (analysisPlan.shouldAnalyze && request.user.llmApiKey) {
      void analyzeDocumentAsync(
        doc.id,
        fileBuffer,
        mimeType,
        request.user.llmProvider!,
        decrypt(request.user.llmApiKey),
        fastify.log
      );
    }

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

    if (!caseRecord.driveFolderId) {
      return reply
        .code(400)
        .send({ error: "Case has no Google Drive folder. Reconnect Google Drive." });
    }

    if (!request.user.googleToken) {
      return reply
        .code(400)
        .send({ error: "Google Drive not connected. Please re-authenticate." });
    }

    let driveFile;
    try {
      const tokens = JSON.parse(decrypt(request.user.googleToken));
      const driveService = new GoogleDriveService(tokens);
      driveFile = await driveService.uploadFile(
        title.endsWith(".txt") ? title : `${title}.txt`,
        "text/plain",
        Buffer.from(content, "utf8"),
        caseRecord.driveFolderId
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply
        .code(500)
        .send({ error: `Failed to upload to Google Drive: ${message}` });
    }

    const [doc] = await db
      .insert(documents)
      .values({
        caseId,
        driveFileId: driveFile.id,
        fileName: driveFile.name,
        fileType: "text/plain",
        category: "clinical_notes",
        docDate: null,
        ocrText: content,
        aiSummary: summarizeTextContent(content),
        aiMetadata: null,
        analysisStatus: "completed",
        analysisError: null,
        analysisStartedAt: new Date(),
        analysisCompletedAt: new Date(),
      })
      .returning();

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

  fastify.post<{ Params: { id: string } }>(
    "/api/documents/:id/reanalyze",
    async (request, reply) => {
      const { id: docId } = request.params;

      const [doc] = await db
        .select({
          id: documents.id,
          driveFileId: documents.driveFileId,
          fileType: documents.fileType,
          caseUserId: cases.userId,
        })
        .from(documents)
        .innerJoin(cases, eq(documents.caseId, cases.id))
        .where(eq(documents.id, docId))
        .limit(1);

      if (!doc || doc.caseUserId !== request.user.id) {
        return reply.code(404).send({ error: "Document not found" });
      }

      if (!request.user.googleToken) {
        return reply
          .code(400)
          .send({ error: "Google Drive not connected. Please re-authenticate." });
      }

      if (!request.user.llmProvider || !request.user.llmApiKey) {
        return reply
          .code(400)
          .send({ error: "Configure AI Provider and API Key before re-analysis." });
      }

      const analysisPlan = getAnalysisPlan(
        doc.fileType || "",
        request.user.llmProvider,
        true
      );

      if (!analysisPlan.shouldAnalyze) {
        return reply.code(400).send({ error: analysisPlan.reason });
      }

      await markDocumentQueued(docId);

      void reanalyzeDocumentFromDrive(
        docId,
        doc.driveFileId,
        request.user.googleToken,
        request.user.llmProvider,
        decrypt(request.user.llmApiKey),
        fastify.log
      );

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
          driveFileId: documents.driveFileId,
          caseId: documents.caseId,
          caseUserId: cases.userId,
        })
        .from(documents)
        .innerJoin(cases, eq(documents.caseId, cases.id))
        .where(eq(documents.id, docId))
        .limit(1);

      if (!doc || doc.caseUserId !== request.user.id) {
        return reply.code(404).send({ error: "Document not found" });
      }

      if (request.user.googleToken) {
        try {
          const tokens = JSON.parse(decrypt(request.user.googleToken));
          const driveService = new GoogleDriveService(tokens);
          await driveService.deleteFile(doc.driveFileId);
        } catch (err) {
          fastify.log.warn(
            { err, docId },
            "Failed to delete file from Google Drive"
          );
        }
      }

      await db.delete(documents).where(eq(documents.id, docId));

      return reply.send({ success: true });
    }
  );
}
