import { FastifyInstance } from "fastify";
import { google } from "googleapis";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/auth.js";
import { config, normalizeEmail } from "../lib/config.js";
import { authMiddleware } from "../middleware/auth.js";
import { randomBytes, timingSafeEqual } from "node:crypto";

// Google sign-in is used for app identity only — file storage lives in
// NotebookLM, so we no longer request the Drive scope.
interface GoogleTokens {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
  id_token?: string;
}

export interface GoogleIdentity {
  email: string;
  name?: string | null;
}

export interface AuthRoutesOptions {
  exchangeGoogleCode?: (code: string) => Promise<GoogleIdentity>;
}

const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
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

async function fetchGoogleIdentity(code: string): Promise<GoogleIdentity> {
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

  return { email: profile.email, name: profile.name };
}

async function upsertOwnerUser(email: string, name?: string | null) {
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    const [updated] = await db
      .update(users)
      .set({
        googleToken: null,
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
      googleToken: null,
    })
    .returning();

  return created;
}

function statesMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function authRoutes(
  fastify: FastifyInstance,
  options: AuthRoutesOptions = {}
): Promise<void> {
  const exchangeGoogleCode =
    options.exchangeGoogleCode ?? fetchGoogleIdentity;
  const secureCookies = getAppOrigin().startsWith("https://");

  fastify.get("/api/auth/google", async (_request, reply) => {
    const oauth2Client = createGoogleClient();
    const state = randomBytes(32).toString("base64url");
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state,
    });

    reply.setCookie("fc_oauth_state", state, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      maxAge: 10 * 60,
      signed: true,
    });
    return reply.redirect(authUrl);
  });

  fastify.get<{
    Querystring: { code?: string; error?: string; state?: string };
  }>("/api/auth/google/callback", async (request, reply) => {
    const callbackUrl = new URL("/auth/callback", getAppOrigin());
    const signedState = request.cookies.fc_oauth_state;
    const unsignedState = signedState
      ? request.unsignCookie(signedState)
      : { valid: false, value: null };

    reply.clearCookie("fc_oauth_state", { path: "/" });

    if (
      !request.query.state ||
      !unsignedState.valid ||
      !unsignedState.value ||
      !statesMatch(request.query.state, unsignedState.value)
    ) {
      callbackUrl.searchParams.set("error", "invalid_state");
      return reply.redirect(callbackUrl.toString());
    }

    if (request.query.error) {
      callbackUrl.searchParams.set("error", request.query.error);
      return reply.redirect(callbackUrl.toString());
    }

    if (!request.query.code) {
      callbackUrl.searchParams.set("error", "missing_code");
      return reply.redirect(callbackUrl.toString());
    }

    try {
      const identity = await exchangeGoogleCode(request.query.code);
      const email = normalizeEmail(identity.email);

      if (email !== config.ownerEmail) {
        callbackUrl.searchParams.set("error", "unauthorized");
        return reply.redirect(callbackUrl.toString());
      }

      const user = await upsertOwnerUser(email, identity.name);
      const jwt = signToken({ userId: user.id, email: user.email });

      reply.setCookie("fc_session", jwt, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        maxAge: 7 * 24 * 60 * 60,
      });
      return reply.redirect(callbackUrl.toString());
    } catch (err) {
      request.log.error(
        { error: err instanceof Error ? err.message : "Unknown error" },
        "Google sign-in failed"
      );
      callbackUrl.searchParams.set("error", "login_failed");
      return reply.redirect(callbackUrl.toString());
    }
  });

  fastify.post(
    "/api/auth/logout",
    { preHandler: authMiddleware },
    async (_request, reply) => {
      reply.clearCookie("fc_session", { path: "/" });
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
        },
      });
    }
  );
}
