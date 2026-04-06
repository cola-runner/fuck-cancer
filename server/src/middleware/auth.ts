import { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "../lib/auth.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

declare module "fastify" {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      name: string | null;
      googleToken: string | null;
      llmProvider: string | null;
      llmApiKey: string | null;
    };
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = verifyToken(token);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      reply.code(401).send({ error: "User not found" });
      return;
    }

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      googleToken: user.googleToken,
      llmProvider: user.llmProvider,
      llmApiKey: user.llmApiKey,
    };
  } catch {
    reply.code(401).send({ error: "Invalid or expired token" });
  }
}
