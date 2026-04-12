import { FastifyInstance } from "fastify";
import { google } from "googleapis";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/auth.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import { config } from "../lib/config.js";
import type { GoogleTokens } from "../lib/google-drive.js";
import { authMiddleware } from "../middleware/auth.js";

const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/drive.file",
];

function getGoogleRedirectUri(): string {
  return config.googleRedirectUri;
}

function getAppOrigin(): string {
  return config.appOrigin;
}

function createGoogleClient() {
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    getGoogleRedirectUri()
  );
}

async function exchangeGoogleCode(code: string) {
  const oauth2Client = createGoogleClient();
  const tokenResponse = await oauth2Client.getToken(code);
  const tokens = tokenResponse.tokens as GoogleTokens;

  if (!tokens.access_token && !tokens.refresh_token) {
    throw new Error("No Google tokens received");
  }

  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: profile } = await oauth2.userinfo.get();

  if (!profile.email) {
    throw new Error("Could not retrieve email from Google");
  }

  return { profile, tokens };
}

async function upsertGoogleUser(
  email: string,
  name: string | null | undefined,
  tokens: GoogleTokens
) {
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let mergedTokens = tokens;
  if (existingUser?.googleToken) {
    try {
      const existingTokens = JSON.parse(decrypt(existingUser.googleToken)) as GoogleTokens;
      if (!tokens.refresh_token && existingTokens.refresh_token) {
        mergedTokens = { ...existingTokens, ...tokens };
      }
    } catch {
      mergedTokens = tokens;
    }
  }

  const encryptedToken = encrypt(JSON.stringify(mergedTokens));

  if (existingUser) {
    const [updated] = await db
      .update(users)
      .set({
        googleToken: encryptedToken,
        name: name || existingUser.name,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      name: name || null,
      googleToken: encryptedToken,
    })
    .returning();

  return created;
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/auth/google", async (_request, reply) => {
    const oauth2Client = createGoogleClient();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
    });

    return reply.redirect(authUrl);
  });

  fastify.get<{
    Querystring: { code?: string; error?: string };
  }>("/api/auth/google/callback", async (request, reply) => {
    const callbackUrl = new URL("/auth/callback", getAppOrigin());

    if (request.query.error) {
      callbackUrl.searchParams.set("error", request.query.error);
      return reply.redirect(callbackUrl.toString());
    }

    if (!request.query.code) {
      callbackUrl.searchParams.set("error", "missing_code");
      return reply.redirect(callbackUrl.toString());
    }

    try {
      const { profile, tokens } = await exchangeGoogleCode(request.query.code);
      const user = await upsertGoogleUser(profile.email!, profile.name, tokens);
      const jwt = signToken({ userId: user.id, email: user.email });

      callbackUrl.searchParams.set("token", jwt);
      return reply.redirect(callbackUrl.toString());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      callbackUrl.searchParams.set("error", message);
      return reply.redirect(callbackUrl.toString());
    }
  });

  // Exchange Google auth code for tokens, create/find user, return JWT
  fastify.post<{
    Body: { code: string; redirectUri: string };
  }>("/api/auth/google", async (request, reply) => {
    const { code } = request.body;

    if (!code) {
      return reply.code(400).send({ error: "code is required" });
    }

    try {
      const { profile, tokens } = await exchangeGoogleCode(code);
      const user = await upsertGoogleUser(profile.email!, profile.name, tokens);
      const jwt = signToken({ userId: user.id, email: user.email });

      return reply.send({
        token: jwt,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(400).send({ error: `Failed to exchange code: ${message}` });
    }
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
