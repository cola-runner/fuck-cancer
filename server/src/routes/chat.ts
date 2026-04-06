import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { conversations, cases, documents } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import { createLLMProvider, type ChatMessage } from "../lib/llm.js";
import { decrypt } from "../lib/encryption.js";
import { SkillRegistry } from "../skills/index.js";

const skillRegistry = new SkillRegistry();

const SYSTEM_PROMPT = `You are a helpful medical records assistant for a cancer patient. You have access to the patient's medical documents and their summaries. Use this information to answer questions accurately and compassionately.

You also have access to medical data tools that you should use when relevant:
- Drug information lookup (RxNorm, DailyMed, OpenFDA) - search drugs, check interactions, get labeling info, find adverse events
- Lab test reference ranges (NIH Clinical Tables) - look up standard units and reference values
- Medical condition search (NIH Clinical Tables) - find condition codes and descriptions
- Clinical guidelines search (PubMed) - find evidence-based treatment guidelines

When a user asks about medications, side effects, drug interactions, lab results, or treatment guidelines, use these tools to provide accurate, up-to-date information. Always note that tool results come from public databases and the user should consult their healthcare provider for personalized medical advice.

Important guidelines:
- Be factual and reference specific documents when possible
- If you don't have enough information to answer confidently, say so
- Never provide medical advice or diagnoses - direct the user to consult their healthcare provider
- Be sensitive to the emotional nature of cancer treatment
- Help organize and explain medical information in plain language

Here are the patient's documents and their summaries:

`;

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", authMiddleware);

  // Send a chat message for a case
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

    // Check LLM configuration
    if (!request.user.llmProvider || !request.user.llmApiKey) {
      return reply.code(400).send({
        error:
          "No LLM provider configured. Go to Settings to add your API key.",
      });
    }

    // Gather all document context for this case
    const caseDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.caseId, caseId))
      .orderBy(documents.createdAt);

    let documentContext = "";
    for (const doc of caseDocs) {
      documentContext += `\n--- Document: ${doc.fileName} (${doc.category || "uncategorized"}) ---\n`;
      if (doc.docDate) {
        documentContext += `Date: ${doc.docDate}\n`;
      }
      if (doc.aiSummary) {
        documentContext += `Summary: ${doc.aiSummary}\n`;
      }
      if (doc.ocrText) {
        documentContext += `Content: ${doc.ocrText}\n`;
      }
      if (doc.aiMetadata) {
        documentContext += `Details: ${JSON.stringify(doc.aiMetadata)}\n`;
      }
    }

    const systemMessage = SYSTEM_PROMPT + documentContext;

    // Fetch existing conversation history for context
    const history = await db
      .select()
      .from(conversations)
      .where(eq(conversations.caseId, caseId))
      .orderBy(conversations.createdAt);

    // Build messages array for the LLM
    const llmMessages: ChatMessage[] = [
      { role: "system", content: systemMessage },
    ];

    for (const entry of history) {
      llmMessages.push({
        role: entry.role as "user" | "assistant",
        content: entry.content,
      });
    }

    // Add the new user message
    llmMessages.push({ role: "user", content: message });

    // Store the user message
    const [userMsg] = await db
      .insert(conversations)
      .values({
        caseId,
        role: "user",
        content: message,
      })
      .returning();

    // Call the LLM with tool support
    let assistantContent: string;
    try {
      const provider = createLLMProvider(
        request.user.llmProvider,
        decrypt(request.user.llmApiKey)
      );

      const tools = skillRegistry.getToolDefinitions();
      assistantContent = await provider.chatWithTools(
        llmMessages,
        tools,
        (name, args) => skillRegistry.executeTool(name, args),
        {
          temperature: 0.5,
          maxTokens: 4096,
        }
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown LLM error";
      fastify.log.error({ err }, "LLM chat request failed");
      return reply
        .code(502)
        .send({ error: `LLM request failed: ${errorMessage}` });
    }

    // Store the assistant response
    const [assistantMsg] = await db
      .insert(conversations)
      .values({
        caseId,
        role: "assistant",
        content: assistantContent,
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
}
