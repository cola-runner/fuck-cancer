import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import Fastify from "fastify";
import { AuthError } from "@cola_runner/gemini-notebook-cli";
import { eq } from "drizzle-orm";

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
  NOTEBOOKLM_STORAGE_PATH: "/tmp/fc-missing-storage-state.json",
  NODE_ENV: "test",
});

const [
  { db },
  schema,
  { signToken },
  { casesRoutes },
  { documentsRoutes },
  { researchRoutes },
] = await Promise.all([
  import("../src/db/index.js"),
  import("../src/db/schema.js"),
  import("../src/lib/auth.js"),
  import("../src/routes/cases.js"),
  import("../src/routes/documents.js"),
  import("../src/routes/research.js"),
]);

const { users, cases, documents } = schema;

beforeEach(async () => {
  await db.delete(users);
});

async function createOwnedCase() {
  const [user] = await db
    .insert(users)
    .values({ email: "owner@example.com", name: "Owner" })
    .returning();
  const [caseRecord] = await db
    .insert(cases)
    .values({
      userId: user.id,
      patientName: "患者",
      notebookId: "notebook-1",
    })
    .returning();
  const authorization = `Bearer ${signToken({
    userId: user.id,
    email: user.email,
  })}`;
  return { user, caseRecord, authorization };
}

test("创建病例时 NotebookLM 会话失效返回 503，且不落本地记录", async () => {
  const [user] = await db
    .insert(users)
    .values({ email: "owner@example.com", name: "Owner" })
    .returning();
  const app = Fastify({ logger: false });
  await casesRoutes(app, {
    createNotebook: async () => {
      throw new AuthError("expired");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/cases",
    headers: {
      authorization: `Bearer ${signToken({
        userId: user.id,
        email: user.email,
      })}`,
    },
    payload: { patientName: "患者" },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "NOTEBOOKLM_AUTH_REQUIRED");
  assert.equal((await db.select().from(cases)).length, 0);
  await app.close();
});

test("远端 notebook 删除返回 false 时保留本地病例", async () => {
  const { caseRecord, authorization } = await createOwnedCase();
  const app = Fastify({ logger: false });
  await casesRoutes(app, {
    deleteNotebook: async () => false,
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/cases/${caseRecord.id}`,
    headers: { authorization },
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().code, "REMOTE_DELETE_FAILED");
  assert.equal(
    (await db.select().from(cases).where(eq(cases.id, caseRecord.id))).length,
    1
  );
  await app.close();
});

test("远端 notebook 删除抛错时保留本地病例", async () => {
  const { caseRecord, authorization } = await createOwnedCase();
  const app = Fastify({ logger: false });
  await casesRoutes(app, {
    deleteNotebook: async () => {
      throw new AuthError("expired");
    },
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/cases/${caseRecord.id}`,
    headers: { authorization },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "NOTEBOOKLM_AUTH_REQUIRED");
  assert.equal(
    (await db.select().from(cases).where(eq(cases.id, caseRecord.id))).length,
    1
  );
  await app.close();
});

test("远端 notebook 删除成功后才删除本地病例", async () => {
  const { caseRecord, authorization } = await createOwnedCase();
  const app = Fastify({ logger: false });
  await casesRoutes(app, {
    deleteNotebook: async () => true,
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/cases/${caseRecord.id}`,
    headers: { authorization },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    (await db.select().from(cases).where(eq(cases.id, caseRecord.id))).length,
    0
  );
  await app.close();
});

test("添加文本时 NotebookLM 会话失效返回 503，且不落本地文档", async () => {
  const { caseRecord, authorization } = await createOwnedCase();
  const app = Fastify({ logger: false });
  await documentsRoutes(app, {
    addTextSource: async () => {
      throw new AuthError("expired");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/documents/text`,
    headers: { authorization },
    payload: { title: "病历", content: "正文" },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "NOTEBOOKLM_AUTH_REQUIRED");
  assert.equal((await db.select().from(documents)).length, 0);
  await app.close();
});

test("远端 source 删除失败时保留本地文档，成功后才删除", async () => {
  const { caseRecord, authorization } = await createOwnedCase();
  const [doc] = await db
    .insert(documents)
    .values({
      caseId: caseRecord.id,
      sourceId: "source-1",
      fileName: "病历.pdf",
      sourceStatus: "ready",
    })
    .returning();
  let shouldDelete = false;
  const app = Fastify({ logger: false });
  await documentsRoutes(app, {
    deleteSource: async () => shouldDelete,
  });

  const failed = await app.inject({
    method: "DELETE",
    url: `/api/documents/${doc.id}`,
    headers: { authorization },
  });
  assert.equal(failed.statusCode, 502);
  assert.equal(failed.json().code, "REMOTE_DELETE_FAILED");
  assert.equal(
    (await db.select().from(documents).where(eq(documents.id, doc.id))).length,
    1
  );

  shouldDelete = true;
  const succeeded = await app.inject({
    method: "DELETE",
    url: `/api/documents/${doc.id}`,
    headers: { authorization },
  });
  assert.equal(succeeded.statusCode, 200);
  assert.equal(
    (await db.select().from(documents).where(eq(documents.id, doc.id))).length,
    0
  );
  await app.close();
});

test("远端 source 删除鉴权失败返回 503 并保留本地文档", async () => {
  const { caseRecord, authorization } = await createOwnedCase();
  const [doc] = await db
    .insert(documents)
    .values({
      caseId: caseRecord.id,
      sourceId: "source-1",
      fileName: "病历.pdf",
      sourceStatus: "ready",
    })
    .returning();
  const app = Fastify({ logger: false });
  await documentsRoutes(app, {
    deleteSource: async () => {
      throw new AuthError("expired");
    },
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/documents/${doc.id}`,
    headers: { authorization },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "NOTEBOOKLM_AUTH_REQUIRED");
  assert.equal(
    (await db.select().from(documents).where(eq(documents.id, doc.id))).length,
    1
  );
  await app.close();
});

test("已就绪的自动药品资料禁止单独删除，避免永久占用去重记录", async () => {
  const { caseRecord, authorization } = await createOwnedCase();
  const [doc] = await db
    .insert(documents)
    .values({
      caseId: caseRecord.id,
      sourceId: "auto-source-1",
      fileName: "自动药品资料",
      origin: "auto",
      sourceStatus: "ready",
    })
    .returning();
  let remoteDeleteCalls = 0;
  const app = Fastify({ logger: false });
  await documentsRoutes(app, {
    deleteSource: async () => {
      remoteDeleteCalls += 1;
      return true;
    },
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/documents/${doc.id}`,
    headers: { authorization },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, "MANAGED_AUTO_SOURCE");
  assert.equal(remoteDeleteCalls, 0);
  assert.equal(
    (await db.select().from(documents).where(eq(documents.id, doc.id))).length,
    1
  );
  await app.close();
});

test("处理中的自动药品资料允许远端确认后删除，以便从进程中断中恢复", async () => {
  const { caseRecord, authorization } = await createOwnedCase();
  const [doc] = await db
    .insert(documents)
    .values({
      caseId: caseRecord.id,
      sourceId: "pending-auto-source",
      fileName: "中断的自动资料",
      origin: "auto",
      sourceStatus: "processing",
    })
    .returning();
  const app = Fastify({ logger: false });
  await documentsRoutes(app, {
    deleteSource: async () => true,
  });

  const response = await app.inject({
    method: "DELETE",
    url: `/api/documents/${doc.id}`,
    headers: { authorization },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    (await db.select().from(documents).where(eq(documents.id, doc.id))).length,
    0
  );
  await app.close();
});

test("启动研究时 NotebookLM 会话失效返回 503", async () => {
  const { caseRecord, authorization } = await createOwnedCase();
  const app = Fastify({ logger: false });
  await researchRoutes(app, {
    startResearch: async () => {
      throw new AuthError("expired");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/research`,
    headers: { authorization },
    payload: { query: "用药资料" },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "NOTEBOOKLM_AUTH_REQUIRED");
  await app.close();
});
