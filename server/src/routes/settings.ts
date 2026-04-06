import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import { encrypt } from "../lib/encryption.js";

const VALID_PROVIDERS = ["gemini", "claude", "openai"];

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", authMiddleware);

  // Update LLM provider and API key
  fastify.put<{
    Body: { llmProvider: string; llmApiKey: string };
  }>("/api/settings/llm", async (request, reply) => {
    const { llmProvider, llmApiKey } = request.body;

    if (!llmProvider || !llmApiKey) {
      return reply
        .code(400)
        .send({ error: "llmProvider and llmApiKey are required" });
    }

    if (!VALID_PROVIDERS.includes(llmProvider)) {
      return reply.code(400).send({
        error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
      });
    }

    // Encrypt the API key before storing
    const encryptedKey = encrypt(llmApiKey);

    const [updated] = await db
      .update(users)
      .set({
        llmProvider,
        llmApiKey: encryptedKey,
        updatedAt: new Date(),
      })
      .where(eq(users.id, request.user.id))
      .returning();

    return reply.send({
      settings: {
        llmProvider: updated.llmProvider,
        hasLlmKey: true,
      },
    });
  });
}
