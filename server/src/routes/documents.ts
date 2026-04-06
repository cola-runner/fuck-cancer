import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { documents, cases } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import { GoogleDriveService } from "../lib/google-drive.js";
import { createLLMProvider, type ChatMessage } from "../lib/llm.js";
import { decrypt } from "../lib/encryption.js";

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

export async function documentsRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.addHook("preHandler", authMiddleware);

  // Upload a document to a case
  fastify.post<{ Params: { id: string } }>(
    "/api/cases/:id/documents",
    async (request, reply) => {
      const { id: caseId } = request.params;

      // Verify case ownership
      const [caseRecord] = await db
        .select()
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.userId, request.user.id)))
        .limit(1);

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

      // Parse the multipart upload
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: "No file uploaded" });
      }

      const fileBuffer = await data.toBuffer();
      const fileName = data.filename;
      const mimeType = data.mimetype;

      // Upload to Google Drive
      let driveFile;
      try {
        const tokens = JSON.parse(decrypt(request.user.googleToken));
        const driveService = new GoogleDriveService(tokens.access_token);
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

      // Create the document record
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
        })
        .returning();

      // Trigger async AI analysis if the user has an LLM configured
      // and the document is an image or PDF
      if (
        request.user.llmProvider &&
        request.user.llmApiKey &&
        (mimeType.startsWith("image/") || mimeType === "application/pdf")
      ) {
        // Fire and forget - don't block the upload response
        analyzeDocumentAsync(
          doc.id,
          fileBuffer,
          mimeType,
          request.user.llmProvider,
          decrypt(request.user.llmApiKey)
        ).catch((err) => {
          fastify.log.error({ err, docId: doc.id }, "Async document analysis failed");
        });
      }

      return reply.code(201).send({ document: doc });
    }
  );

  // List documents for a case
  fastify.get<{ Params: { id: string } }>(
    "/api/cases/:id/documents",
    async (request, reply) => {
      const { id: caseId } = request.params;

      // Verify case ownership
      const [caseRecord] = await db
        .select()
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.userId, request.user.id)))
        .limit(1);

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

  // Delete a document
  fastify.delete<{ Params: { id: string } }>(
    "/api/documents/:id",
    async (request, reply) => {
      const { id: docId } = request.params;

      // Find the document and verify ownership through the case
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

      // Delete from Google Drive
      if (request.user.googleToken) {
        try {
          const tokens = JSON.parse(decrypt(request.user.googleToken));
          const driveService = new GoogleDriveService(tokens.access_token);
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

// ---------------------------------------------------------------------------
// Async analysis helper
// ---------------------------------------------------------------------------
async function analyzeDocumentAsync(
  docId: string,
  fileBuffer: Buffer,
  mimeType: string,
  providerName: string,
  apiKey: string
): Promise<void> {
  const provider = createLLMProvider(providerName, apiKey);

  const base64 = fileBuffer.toString("base64");
  const rawResponse = await provider.analyzeImage(base64, ANALYSIS_PROMPT);

  // Try to parse the JSON response
  let parsed: {
    documentType?: string;
    date?: string | null;
    summary?: string;
    keyValues?: Record<string, string>;
    category?: string;
  };

  try {
    // Strip markdown code fences if present
    const cleaned = rawResponse
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // If parsing fails, use the raw text as the summary
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
    })
    .where(eq(documents.id, docId));
}
