import { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "../lib/auth.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { config, normalizeEmail } from "../lib/config.js";

declare module "fastify" {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      name: string | null;
      googleToken: string | null;
    };
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  const bearerToken =
    header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = request.cookies?.fc_session || bearerToken;

  if (!token) {
    reply.code(401).send({ error: "Missing or invalid session" });
    return;
  }

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

    const userEmail = normalizeEmail(user.email);
    if (
      userEmail !== config.ownerEmail ||
      normalizeEmail(payload.email) !== userEmail
    ) {
      reply.code(401).send({ error: "Invalid session user" });
      return;
    }

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      googleToken: user.googleToken,
    };
  } catch {
    reply.code(401).send({ error: "Invalid or expired token" });
  }
}
