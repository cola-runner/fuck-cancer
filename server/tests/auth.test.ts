import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { google } from "googleapis";

Object.assign(process.env, {
  DATABASE_PATH: ":memory:",
  JWT_SECRET: "test-jwt-secret",
  ENCRYPTION_KEY: "00".repeat(32),
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
  OWNER_EMAIL: "owner@example.com",
  APP_ORIGIN: "http://localhost:5173",
  CORS_ORIGIN: "http://localhost:5173",
  NODE_ENV: "test",
});

const [{ db }, { users }, { authRoutes }] = await Promise.all([
  import("../src/db/index.js"),
  import("../src/db/schema.js"),
  import("../src/routes/auth.js"),
]);

const originalGetToken = google.auth.OAuth2.prototype.getToken;

beforeEach(async () => {
  await db.delete(users);
  google.auth.OAuth2.prototype.getToken = (async () => {
    throw new Error("Unexpected real Google token exchange in test");
  }) as typeof google.auth.OAuth2.prototype.getToken;
});

after(() => {
  google.auth.OAuth2.prototype.getToken = originalGetToken;
});

interface GoogleIdentity {
  email: string;
  name?: string | null;
}

async function buildAuthApp(
  exchangeGoogleCode?: (code: string) => Promise<GoogleIdentity>
) {
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: process.env.JWT_SECRET });
  await authRoutes(app, exchangeGoogleCode ? { exchangeGoogleCode } : undefined);
  return app;
}

function setCookies(response: { headers: Record<string, unknown> }): string[] {
  const value = response.headers["set-cookie"];
  return Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
}

function cookiePair(setCookie: string): string {
  return setCookie.split(";", 1)[0];
}

async function beginGoogleLogin(app: Awaited<ReturnType<typeof buildAuthApp>>) {
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/google",
  });
  const redirect = new URL(response.headers.location!);
  const state = redirect.searchParams.get("state");
  const stateCookie = setCookies(response).find((value) =>
    value.startsWith("fc_oauth_state=")
  );

  assert.equal(response.statusCode, 302);
  assert.ok(state);
  assert.ok(stateCookie);

  return { state, stateCookie: cookiePair(stateCookie) };
}

test("Google 登录开始时设置带签名校验的短期 state", async () => {
  const app = await buildAuthApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/auth/google",
  });

  assert.equal(response.statusCode, 302);
  const redirect = new URL(response.headers.location!);
  const state = redirect.searchParams.get("state");
  assert.ok(state);
  assert.match(
    String(response.headers["set-cookie"]),
    /fc_oauth_state=.+HttpOnly.+SameSite=Lax/i
  );

  await app.close();
});

test("OAuth callback 拒绝不匹配的 state，且不交换 code", async () => {
  let exchangeCalls = 0;
  const app = await buildAuthApp(async () => {
    exchangeCalls += 1;
    return { email: "owner@example.com", name: "Owner" };
  });
  const { stateCookie } = await beginGoogleLogin(app);

  const response = await app.inject({
    method: "GET",
    url: "/api/auth/google/callback?code=fake&state=wrong",
    headers: { cookie: stateCookie },
  });

  assert.equal(response.statusCode, 302);
  assert.equal(
    new URL(response.headers.location!).searchParams.get("error"),
    "invalid_state"
  );
  assert.equal(exchangeCalls, 0);
  assert.equal((await db.select().from(users)).length, 0);

  await app.close();
});

test("非部署者 Google 账号不能创建用户或获得会话", async () => {
  const app = await buildAuthApp(async () => ({
    email: "intruder@example.com",
    name: "Intruder",
  }));
  const { state, stateCookie } = await beginGoogleLogin(app);

  const response = await app.inject({
    method: "GET",
    url: `/api/auth/google/callback?code=fake&state=${encodeURIComponent(state)}`,
    headers: { cookie: stateCookie },
  });

  assert.equal(response.statusCode, 302);
  assert.equal(
    new URL(response.headers.location!).searchParams.get("error"),
    "unauthorized"
  );
  assert.equal(
    setCookies(response).some((value) => value.startsWith("fc_session=")),
    false
  );
  assert.equal((await db.select().from(users)).length, 0);

  await app.close();
});

test("部署者登录只设置 HttpOnly 会话 Cookie，不把 JWT 放进 URL", async () => {
  const app = await buildAuthApp(async () => ({
    email: "  OWNER@EXAMPLE.COM ",
    name: "Owner",
  }));
  const { state, stateCookie } = await beginGoogleLogin(app);

  const response = await app.inject({
    method: "GET",
    url: `/api/auth/google/callback?code=fake&state=${encodeURIComponent(state)}`,
    headers: { cookie: stateCookie },
  });

  assert.equal(response.statusCode, 302);
  const redirect = new URL(response.headers.location!);
  assert.equal(redirect.searchParams.get("token"), null);
  assert.equal(redirect.searchParams.get("error"), null);
  const sessionCookie = setCookies(response).find((value) =>
    value.startsWith("fc_session=")
  );
  assert.ok(sessionCookie);
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /SameSite=Lax/i);

  const storedUsers = await db.select().from(users);
  assert.equal(storedUsers.length, 1);
  assert.equal(storedUsers[0].email, "owner@example.com");
  assert.equal(storedUsers[0].googleToken, null);

  const me = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: cookiePair(sessionCookie) },
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.email, "owner@example.com");

  await app.close();
});

test("不保留可绕过 OAuth state 的 POST code 交换入口", async () => {
  const app = await buildAuthApp(async () => ({
    email: "owner@example.com",
    name: "Owner",
  }));

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/google",
    payload: { code: "fake", redirectUri: "http://localhost" },
  });

  assert.equal(response.statusCode, 404);
  assert.equal((await db.select().from(users)).length, 0);

  await app.close();
});
