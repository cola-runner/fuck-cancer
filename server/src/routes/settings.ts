import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import { encrypt } from "../lib/encryption.js";

const VALID_PROVIDERS = ["gemini", "claude", "openai"];

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", authMiddleware);

  fastify.get("/api/settings", async (request, reply) => {
    return reply.send({
      provider: request.user.llmProvider,
      hasApiKey: !!request.user.llmApiKey,
    });
  });

  const saveLlmSettings = async (
    llmProvider: string,
    llmApiKey: string,
    userId: string
  ) => {
    if (!llmProvider || !llmApiKey) {
      throw new Error("llmProvider and llmApiKey are required");
    }

    if (!VALID_PROVIDERS.includes(llmProvider)) {
      throw new Error(
        `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`
      );
    }

    const encryptedKey = encrypt(llmApiKey);

    const [updated] = await db
      .update(users)
      .set({
        llmProvider,
        llmApiKey: encryptedKey,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return updated;
  };

  // Update LLM provider and API key
  fastify.put<{
    Body: { llmProvider: string; llmApiKey: string };
  }>("/api/settings/llm", async (request, reply) => {
    const { llmProvider, llmApiKey } = request.body;

    try {
      const updated = await saveLlmSettings(
        llmProvider,
        llmApiKey,
        request.user.id
      );

      return reply.send({
        settings: {
          llmProvider: updated.llmProvider,
          hasLlmKey: true,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      return reply.code(400).send({ error: message });
    }
  });

  fastify.put<{
    Body: { provider: string; apiKey: string };
  }>("/api/settings", async (request, reply) => {
    try {
      const updated = await saveLlmSettings(
        request.body.provider,
        request.body.apiKey,
        request.user.id
      );

      return reply.send({
        provider: updated.llmProvider,
        hasApiKey: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      return reply.code(400).send({ error: message });
    }
  });
}
