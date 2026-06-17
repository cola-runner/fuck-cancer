import type { FastifyReply, FastifyRequest, FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { cases, documents } from "../db/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import {
  withNotebookLM,
  isAuthError,
  NOTEBOOKLM_AUTH_HINT,
} from "../lib/notebooklm.js";

export async function casesRoutes(fastify: FastifyInstance): Promise<void> {
  // All case routes require authentication
  fastify.addHook("preHandler", authMiddleware);

  // List all cases for the current user
  fastify.get("/api/cases", async (request, reply) => {
    const userCases = await db
      .select({
        id: cases.id,
        userId: cases.userId,
        patientName: cases.patientName,
        diagnosis: cases.diagnosis,
        notes: cases.notes,
        notebookId: cases.notebookId,
        createdAt: cases.createdAt,
        updatedAt: cases.updatedAt,
        fileCount: sql<number>`count(${documents.id})`,
      })
      .from(cases)
      .leftJoin(documents, eq(documents.caseId, cases.id))
      .where(eq(cases.userId, request.user.id))
      .groupBy(cases.id)
      .orderBy(desc(cases.updatedAt));

    return reply.send({ cases: userCases });
  });

  // Get a single case
  fastify.get<{ Params: { id: string } }>(
    "/api/cases/:id",
    async (request, reply) => {
      const { id } = request.params;

      const [caseRecord] = await db
        .select()
        .from(cases)
        .where(and(eq(cases.id, id), eq(cases.userId, request.user.id)))
        .limit(1);

      if (!caseRecord) {
        return reply.code(404).send({ error: "Case not found" });
      }

      return reply.send({ case: caseRecord });
    }
  );

  // Create a new case backed by a NotebookLM notebook
  fastify.post<{
    Body: { patientName: string; diagnosis?: string; notes?: string };
  }>("/api/cases", async (request, reply) => {
    const { patientName, diagnosis, notes } = request.body;

    if (!patientName) {
      return reply.code(400).send({ error: "patientName is required" });
    }

    // The notebook is the case's backend (sources + grounded chat live there),
    // so create it up front and fail loudly if NotebookLM is unreachable.
    let notebookId: string;
    try {
      const notebook = await withNotebookLM((client) =>
        client.notebooks.create(`FuckCancer - ${patientName}`)
      );
      notebookId = notebook.id;
    } catch (err) {
      if (isAuthError(err)) {
        return reply.code(401).send({ error: NOTEBOOKLM_AUTH_HINT });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      fastify.log.error({ err }, "Failed to create NotebookLM notebook");
      return reply
        .code(502)
        .send({ error: `Failed to create NotebookLM notebook: ${message}` });
    }

    const [newCase] = await db
      .insert(cases)
      .values({
        userId: request.user.id,
        patientName,
        diagnosis: diagnosis || null,
        notes: notes || null,
        notebookId,
      })
      .returning();

    return reply.code(201).send({ case: newCase });
  });

  // Update a case
  type UpdateCaseRequest = FastifyRequest<{
    Params: { id: string };
    Body: { patientName?: string; diagnosis?: string; notes?: string };
  }>;

  const updateCase = async (
    request: UpdateCaseRequest,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const { patientName, diagnosis, notes } = request.body;

    // Verify ownership
    const [existing] = await db
      .select()
      .from(cases)
      .where(and(eq(cases.id, id), eq(cases.userId, request.user.id)))
      .limit(1);

    if (!existing) {
      return reply.code(404).send({ error: "Case not found" });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (patientName !== undefined) updateData.patientName = patientName;
    if (diagnosis !== undefined) updateData.diagnosis = diagnosis;
    if (notes !== undefined) updateData.notes = notes;

    const [updated] = await db
      .update(cases)
      .set(updateData)
      .where(eq(cases.id, id))
      .returning();

    // Keep the notebook title in sync when the patient is renamed.
    if (patientName !== undefined && existing.notebookId) {
      const notebookId = existing.notebookId;
      try {
        await withNotebookLM((client) =>
          client.notebooks.rename(notebookId, `FuckCancer - ${patientName}`)
        );
      } catch (err) {
        fastify.log.warn({ err }, "Failed to rename NotebookLM notebook");
      }
    }

    return reply.send({ case: updated });
  };

  fastify.put<{
    Params: { id: string };
    Body: { patientName?: string; diagnosis?: string; notes?: string };
  }>("/api/cases/:id", updateCase);

  fastify.patch<{
    Params: { id: string };
    Body: { patientName?: string; diagnosis?: string; notes?: string };
  }>("/api/cases/:id", updateCase);

  // Delete a case
  fastify.delete<{ Params: { id: string } }>(
    "/api/cases/:id",
    async (request, reply) => {
      const { id } = request.params;

      // Verify ownership
      const [existing] = await db
        .select()
        .from(cases)
        .where(and(eq(cases.id, id), eq(cases.userId, request.user.id)))
        .limit(1);

      if (!existing) {
        return reply.code(404).send({ error: "Case not found" });
      }

      // Best-effort: delete the backing notebook (and all its sources).
      if (existing.notebookId) {
        const notebookId = existing.notebookId;
        try {
          await withNotebookLM((client) => client.notebooks.delete(notebookId));
        } catch (err) {
          fastify.log.warn(
            { err },
            "Failed to delete NotebookLM notebook for case"
          );
        }
      }

      await db.delete(cases).where(eq(cases.id, id));

      return reply.send({ success: true });
    }
  );
}
