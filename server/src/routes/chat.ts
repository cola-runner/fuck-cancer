import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { conversations, cases, documents } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import { withNotebookLM } from "../lib/notebooklm.js";
import { toNotebookLMError } from "../lib/api-errors.js";

interface ChatAskResult {
  answer: string;
  conversationId?: string;
  references: Array<{ sourceId: string; [key: string]: unknown }>;
}

export interface ChatRoutesOptions {
  ask?: (
    notebookId: string,
    message: string,
    options: { conversationId?: string; sourceIds?: string[] }
  ) => Promise<ChatAskResult>;
}

export async function chatRoutes(
  fastify: FastifyInstance,
  options: ChatRoutesOptions = {}
): Promise<void> {
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

    // Map source id → file name up front so we can give each citation a
    // human-readable source label instead of a raw source UUID.
    const caseDocs = await db
      .select({
        sourceId: documents.sourceId,
        fileName: documents.fileName,
        sourceStatus: documents.sourceStatus,
        origin: documents.origin,
        coverageStatus: documents.coverageStatus,
      })
      .from(documents)
      .where(eq(documents.caseId, caseId));

    if (
      caseDocs.some(
        (document) =>
          document.sourceStatus !== "ready" &&
          document.sourceStatus !== "error"
      )
    ) {
      return reply.code(409).send({
        code: "SOURCES_NOT_READY",
        error: "仍有资料正在处理，请稍后重试。",
      });
    }

    if (caseDocs.some((document) => document.sourceStatus === "error")) {
      return reply.code(409).send({
        code: "SOURCES_FAILED",
        error: "有资料处理失败，请重试或删除失败资料。",
      });
    }

    const userDocuments = caseDocs.filter(
      (document) => document.origin === null
    );
    if (
      userDocuments.some(
        (document) =>
          document.coverageStatus !== "ready" &&
          document.coverageStatus !== "error"
      )
    ) {
      return reply.code(409).send({
        code: "COVERAGE_NOT_READY",
        error: "仍在检查病历中的用药并补充资料，请稍后重试。",
      });
    }

    if (
      userDocuments.some(
        (document) => document.coverageStatus === "error"
      )
    ) {
      return reply.code(409).send({
        code: "COVERAGE_FAILED",
        error: "用药资料补充失败，请重新检测或删除对应病历。",
      });
    }

    const readyDocs = caseDocs.filter(
      (document): document is typeof document & { sourceId: string } =>
        document.sourceStatus === "ready" &&
        typeof document.sourceId === "string" &&
        document.sourceId.length > 0
    );
    if (readyDocs.length === 0) {
      return reply.code(409).send({
        code: "NO_READY_SOURCES",
        error: "没有可用于问答的就绪资料。",
      });
    }

    const readySourceIds = readyDocs.map((document) => document.sourceId);
    const readySourceIdSet = new Set(readySourceIds);
    const nameBySource = new Map(
      readyDocs.map((document) => [document.sourceId, document.fileName])
    );

    // Ask NotebookLM. It grounds the answer in the notebook's sources and
    // returns citations; the conversation id threads multi-turn context.
    let answer: string;
    let conversationId: string | undefined;
    let enrichedRefs: Array<Record<string, unknown>>;
    const notebookId = caseRecord.notebookId;
    try {
      const ask =
        options.ask ??
        ((targetNotebookId, targetMessage, askOptions) =>
          withNotebookLM((client) =>
            client.chat.ask(targetNotebookId, targetMessage, askOptions)
          ));
      const result = await ask(notebookId, message, {
        conversationId: caseRecord.nlmConversationId ?? undefined,
        sourceIds: readySourceIds,
      });
      answer = result.answer;
      conversationId = result.conversationId;
      enrichedRefs = result.references
        .filter((reference) => readySourceIdSet.has(reference.sourceId))
        .map((reference) => ({
          ...reference,
          fileName: nameBySource.get(reference.sourceId) ?? null,
        }));
    } catch (err) {
      fastify.log.error({ err }, "NotebookLM chat request failed");
      const mapped = toNotebookLMError(err);
      return reply.code(mapped.statusCode).send(mapped.body);
    }

    if (enrichedRefs.length === 0) {
      return reply.code(502).send({
        code: "UNGROUNDED_RESPONSE",
        error: "回答没有可验证的资料引用，本次对话未保存。",
      });
    }

    const { userMsg, assistantMsg } = db.transaction((transaction) => {
      const [storedUserMessage] = transaction
        .insert(conversations)
        .values({
          caseId,
          role: "user",
          content: message,
        })
        .returning()
        .all();

      const [storedAssistantMessage] = transaction
        .insert(conversations)
        .values({
          caseId,
          role: "assistant",
          content: answer,
          references: enrichedRefs,
        })
        .returning()
        .all();

      if (conversationId && conversationId !== caseRecord.nlmConversationId) {
        transaction
          .update(cases)
          .set({ nlmConversationId: conversationId, updatedAt: new Date() })
          .where(eq(cases.id, caseId))
          .run();
      }

      return {
        userMsg: storedUserMessage,
        assistantMsg: storedAssistantMessage,
      };
    });

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
