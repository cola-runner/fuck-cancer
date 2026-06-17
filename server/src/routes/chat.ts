import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { conversations, cases, documents } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import {
  withNotebookLM,
  isAuthError,
  NOTEBOOKLM_AUTH_HINT,
} from "../lib/notebooklm.js";

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", authMiddleware);

  // Ask a question against the case's notebook (NotebookLM grounded chat).
  fastify.post<{
    Params: { id: string };
    Body: { message: string };
  }>("/api/cases/:id/chat", async (request, reply) => {
    const { id: caseId } = request.params;
    const { message } = request.body;

    if (!message || !message.trim()) {
      return reply.code(400).send({ error: "message is required" });
    }

    // Verify case ownership
    const [caseRecord] = await db
      .select()
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.userId, request.user.id)))
      .limit(1);

    if (!caseRecord) {
      return reply.code(404).send({ error: "Case not found" });
    }

    if (!caseRecord.notebookId) {
      return reply
        .code(400)
        .send({ error: "Case has no NotebookLM notebook." });
    }

    // Store the user message
    const [userMsg] = await db
      .insert(conversations)
      .values({
        caseId,
        role: "user",
        content: message,
      })
      .returning();

    // Map source id → file name up front so we can give each citation a
    // human-readable source label instead of a raw source UUID.
    const caseDocs = await db
      .select({ sourceId: documents.sourceId, fileName: documents.fileName })
      .from(documents)
      .where(eq(documents.caseId, caseId));
    const nameBySource = new Map(
      caseDocs
        .filter((d) => d.sourceId)
        .map((d) => [d.sourceId as string, d.fileName])
    );

    // Ask NotebookLM. It grounds the answer in the notebook's sources and
    // returns citations; the conversation id threads multi-turn context.
    let answer: string;
    let conversationId: string | undefined;
    let enrichedRefs: Array<Record<string, unknown>>;
    const notebookId = caseRecord.notebookId;
    try {
      const result = await withNotebookLM((client) =>
        client.chat.ask(notebookId, message, {
          conversationId: caseRecord.nlmConversationId ?? undefined,
        })
      );
      answer = result.answer;
      conversationId = result.conversationId;
      enrichedRefs = result.references.map((ref) => ({
        ...ref,
        fileName: nameBySource.get(ref.sourceId) ?? null,
      }));
    } catch (err) {
      if (isAuthError(err)) {
        return reply.code(401).send({ error: NOTEBOOKLM_AUTH_HINT });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      fastify.log.error({ err }, "NotebookLM chat request failed");
      return reply
        .code(502)
        .send({ error: `NotebookLM request failed: ${message}` });
    }

    // Persist the latest conversation id for multi-turn follow-ups.
    if (conversationId && conversationId !== caseRecord.nlmConversationId) {
      await db
        .update(cases)
        .set({ nlmConversationId: conversationId, updatedAt: new Date() })
        .where(eq(cases.id, caseId));
    }

    // Store the assistant response with its citations
    const [assistantMsg] = await db
      .insert(conversations)
      .values({
        caseId,
        role: "assistant",
        content: answer,
        references: enrichedRefs,
      })
      .returning();

    return reply.send({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
    });
  });

  // Get conversation history for a case
  fastify.get<{ Params: { id: string } }>(
    "/api/cases/:id/conversations",
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

      const history = await db
        .select()
        .from(conversations)
        .where(eq(conversations.caseId, caseId))
        .orderBy(conversations.createdAt);

      return reply.send({ conversations: history });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/cases/:id/chat",
    async (request, reply) => {
      const { id: caseId } = request.params;

      const [caseRecord] = await db
        .select()
        .from(cases)
        .where(and(eq(cases.id, caseId), eq(cases.userId, request.user.id)))
        .limit(1);

      if (!caseRecord) {
        return reply.code(404).send({ error: "Case not found" });
      }

      const history = await db
        .select()
        .from(conversations)
        .where(eq(conversations.caseId, caseId))
        .orderBy(conversations.createdAt);

      return reply.send({ messages: history });
    }
  );
}
