import { FastifyInstance } from "fastify";
import { google } from "googleapis";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/auth.js";
import { encrypt } from "../lib/encryption.js";
import { authMiddleware } from "../middleware/auth.js";

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Exchange Google auth code for tokens, create/find user, return JWT
  fastify.post<{
    Body: { code: string; redirectUri: string };
  }>("/api/auth/google", async (request, reply) => {
    const { code, redirectUri } = request.body;

    if (!code || !redirectUri) {
      return reply.code(400).send({ error: "code and redirectUri are required" });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    // Exchange the authorization code for tokens
    let tokens;
    try {
      const tokenResponse = await oauth2Client.getToken(code);
      tokens = tokenResponse.tokens;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(400).send({ error: `Failed to exchange code: ${message}` });
    }

    if (!tokens.access_token) {
      return reply.code(400).send({ error: "No access token received from Google" });
    }

    // Get the user's profile info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.email) {
      return reply.code(400).send({ error: "Could not retrieve email from Google" });
    }

    // Encrypt the token for storage
    const encryptedToken = encrypt(JSON.stringify(tokens));

    // Find or create user
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);

    let user;
    if (existingUser) {
      // Update Google token
      const [updated] = await db
        .update(users)
        .set({
          googleToken: encryptedToken,
          name: profile.name || existingUser.name,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();
      user = updated;
    } else {
      // Create new user
      const [created] = await db
        .insert(users)
        .values({
          email: profile.email,
          name: profile.name || null,
          googleToken: encryptedToken,
        })
        .returning();
      user = created;
    }

    // Issue JWT
    const jwt = signToken({ userId: user.id, email: user.email });

    return reply.send({
      token: jwt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  });

  // Logout - client-side token removal, but we can also clear the Google token
  fastify.post(
    "/api/auth/logout",
    { preHandler: authMiddleware },
    async (request, reply) => {
      await db
        .update(users)
        .set({ googleToken: null, updatedAt: new Date() })
        .where(eq(users.id, request.user.id));

      return reply.send({ success: true });
    }
  );

  // Get current user info
  fastify.get(
    "/api/auth/me",
    { preHandler: authMiddleware },
    async (request, reply) => {
      return reply.send({
        user: {
          id: request.user.id,
          email: request.user.email,
          name: request.user.name,
          llmProvider: request.user.llmProvider,
          hasGoogleToken: !!request.user.googleToken,
          hasLlmKey: !!request.user.llmApiKey,
        },
      });
    }
  );
}
