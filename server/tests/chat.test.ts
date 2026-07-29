import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import Fastify from "fastify";
import { eq, sql } from "drizzle-orm";
import { AuthError } from "@cola_runner/notebooklm-cli";

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

const [{ db }, schema, { signToken }, { chatRoutes }] = await Promise.all([
  import("../src/db/index.js"),
  import("../src/db/schema.js"),
  import("../src/lib/auth.js"),
  import("../src/routes/chat.js"),
]);

const { users, cases, documents, conversations } = schema;

beforeEach(async () => {
  await db.delete(conversations);
  await db.delete(documents);
  await db.delete(cases);
  await db.delete(users);
});

async function createTestCase() {
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
  return { user, caseRecord };
}

function authorizationFor(user: { id: string; email: string }) {
  return `Bearer ${signToken({ userId: user.id, email: user.email })}`;
}

test("拒绝仍有资料处理中时的问答，且不保存单边消息", async () => {
  const { user, caseRecord } = await createTestCase();
  await db.insert(documents).values({
    caseId: caseRecord.id,
    sourceId: "source-1",
    fileName: "报告.pdf",
    sourceStatus: "processing",
  });

  let askCount = 0;
  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async () => {
      askCount += 1;
      return { answer: "不应调用", references: [] };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/chat`,
    headers: {
      authorization: authorizationFor(user),
    },
    payload: { message: "现在能吃什么药？" },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, "SOURCES_NOT_READY");
  assert.equal(askCount, 0);
  assert.deepEqual(await db.select().from(conversations), []);

  await app.close();
});

test("遇到未知资料状态时也按未就绪处理", async () => {
  const { user, caseRecord } = await createTestCase();
  await db.insert(documents).values([
    {
      caseId: caseRecord.id,
      sourceId: "ready-source",
      fileName: "已就绪.pdf",
      sourceStatus: "ready",
      coverageStatus: "ready",
    },
    {
      caseId: caseRecord.id,
      sourceId: "queued-source",
      fileName: "未知状态.pdf",
      sourceStatus: "queued",
    },
  ]);

  let askCount = 0;
  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async () => {
      askCount += 1;
      return { answer: "不应调用", references: [] };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/chat`,
    headers: { authorization: authorizationFor(user) },
    payload: { message: "帮我总结" },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, "SOURCES_NOT_READY");
  assert.equal(askCount, 0);
  assert.deepEqual(await db.select().from(conversations), []);

  await app.close();
});

test("拒绝包含处理失败资料的问答，且不保存消息", async () => {
  const { user, caseRecord } = await createTestCase();
  await db.insert(documents).values({
    caseId: caseRecord.id,
    sourceId: "source-1",
    fileName: "失败报告.pdf",
    sourceStatus: "error",
  });

  let askCount = 0;
  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async () => {
      askCount += 1;
      return { answer: "不应调用", references: [] };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/chat`,
    headers: { authorization: authorizationFor(user) },
    payload: { message: "帮我总结" },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, "SOURCES_FAILED");
  assert.equal(askCount, 0);
  assert.deepEqual(await db.select().from(conversations), []);

  await app.close();
});

test("用户资料的药品覆盖仍在处理中时拒绝问答", async () => {
  const { user, caseRecord } = await createTestCase();
  await db.insert(documents).values({
    caseId: caseRecord.id,
    sourceId: "ready-source",
    fileName: "含用药信息的病历.pdf",
    sourceStatus: "ready",
    coverageStatus: "pending",
  });
  let askCount = 0;
  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async () => {
      askCount += 1;
      return { answer: "不应调用", references: [] };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/chat`,
    headers: { authorization: authorizationFor(user) },
    payload: { message: "现在能一起吃这些药吗？" },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, "COVERAGE_NOT_READY");
  assert.equal(askCount, 0);
  assert.deepEqual(await db.select().from(conversations), []);
  await app.close();
});

test("用户资料的药品覆盖失败时拒绝问答并允许恢复", async () => {
  const { user, caseRecord } = await createTestCase();
  await db.insert(documents).values({
    caseId: caseRecord.id,
    sourceId: "ready-source",
    fileName: "含用药信息的病历.pdf",
    sourceStatus: "ready",
    coverageStatus: "error",
    coverageError: "用药资料补充失败",
  });
  let askCount = 0;
  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async () => {
      askCount += 1;
      return { answer: "不应调用", references: [] };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/chat`,
    headers: { authorization: authorizationFor(user) },
    payload: { message: "现在能一起吃这些药吗？" },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, "COVERAGE_FAILED");
  assert.equal(askCount, 0);
  assert.deepEqual(await db.select().from(conversations), []);
  await app.close();
});

test("没有任何就绪资料时拒绝问答，且不保存消息", async () => {
  const { user, caseRecord } = await createTestCase();

  let askCount = 0;
  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async () => {
      askCount += 1;
      return { answer: "不应调用", references: [] };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/chat`,
    headers: { authorization: authorizationFor(user) },
    payload: { message: "帮我总结" },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, "NO_READY_SOURCES");
  assert.equal(askCount, 0);
  assert.deepEqual(await db.select().from(conversations), []);

  await app.close();
});

test("问答只把本病例的就绪来源交给 NotebookLM", async () => {
  const { user, caseRecord } = await createTestCase();
  await db.insert(documents).values([
    {
      caseId: caseRecord.id,
      sourceId: "ready-source",
      fileName: "已就绪.pdf",
      sourceStatus: "ready",
      coverageStatus: "ready",
    },
    {
      caseId: caseRecord.id,
      sourceId: null,
      fileName: "缺少远端标识.pdf",
      sourceStatus: "ready",
      coverageStatus: "ready",
    },
  ]);

  let receivedSourceIds: string[] | undefined;
  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async (_notebookId, _message, options) => {
      receivedSourceIds = options.sourceIds;
      return {
        answer: "有出处的回答",
        references: [{ sourceId: "ready-source", citedText: "原文" }],
      };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/chat`,
    headers: { authorization: authorizationFor(user) },
    payload: { message: "帮我总结" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(receivedSourceIds, ["ready-source"]);

  await app.close();
});

test("NotebookLM 没有返回可核验引用时不保存任何消息", async () => {
  const { user, caseRecord } = await createTestCase();
  await db.insert(documents).values({
    caseId: caseRecord.id,
    sourceId: "ready-source",
    fileName: "已就绪.pdf",
    sourceStatus: "ready",
    coverageStatus: "ready",
  });

  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async () => ({
      answer: "没有引用的回答",
      references: [],
      conversationId: "conversation-unsafe",
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/chat`,
    headers: { authorization: authorizationFor(user) },
    payload: { message: "帮我总结" },
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().code, "UNGROUNDED_RESPONSE");
  assert.deepEqual(await db.select().from(conversations), []);
  const [unchangedCase] = await db
    .select()
    .from(cases)
    .where(eq(cases.id, caseRecord.id));
  assert.equal(unchangedCase.nlmConversationId, null);

  await app.close();
});

test("NotebookLM 只引用未知来源时不保存任何消息", async () => {
  const { user, caseRecord } = await createTestCase();
  await db.insert(documents).values({
    caseId: caseRecord.id,
    sourceId: "ready-source",
    fileName: "已就绪.pdf",
    sourceStatus: "ready",
    coverageStatus: "ready",
  });

  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async () => ({
      answer: "引用了别处的回答",
      references: [{ sourceId: "unknown-source", citedText: "未知原文" }],
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/chat`,
    headers: { authorization: authorizationFor(user) },
    payload: { message: "帮我总结" },
  });

  assert.equal(response.statusCode, 502);
  assert.equal(response.json().code, "UNGROUNDED_RESPONSE");
  assert.deepEqual(await db.select().from(conversations), []);

  await app.close();
});

test("保存助手消息失败时回滚用户消息和 conversation id", async () => {
  const { user, caseRecord } = await createTestCase();
  await db.insert(documents).values({
    caseId: caseRecord.id,
    sourceId: "ready-source",
    fileName: "已就绪.pdf",
    sourceStatus: "ready",
    coverageStatus: "ready",
  });

  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async () => ({
      answer: "有出处的回答",
      references: [{ sourceId: "ready-source", citedText: "原文" }],
      conversationId: "conversation-new",
    }),
  });

  await db.run(sql.raw(`
    CREATE TRIGGER fail_assistant_insert
    BEFORE INSERT ON conversations
    WHEN NEW.role = 'assistant'
    BEGIN
      SELECT RAISE(ABORT, 'forced assistant insert failure');
    END;
  `));

  let response;
  let storedMessages;
  let storedConversationId: string | null;
  try {
    response = await app.inject({
      method: "POST",
      url: `/api/cases/${caseRecord.id}/chat`,
      headers: { authorization: authorizationFor(user) },
      payload: { message: "帮我总结" },
    });
    storedMessages = await db.select().from(conversations);
    const [storedCase] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, caseRecord.id));
    storedConversationId = storedCase.nlmConversationId;
  } finally {
    await db.run(sql.raw("DROP TRIGGER IF EXISTS fail_assistant_insert"));
    await app.close();
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(storedMessages, []);
  assert.equal(storedConversationId, null);
});

test("NotebookLM 会话失效返回 503，不冒充应用登录失效", async () => {
  const { user, caseRecord } = await createTestCase();
  await db.insert(documents).values({
    caseId: caseRecord.id,
    sourceId: "ready-source",
    fileName: "已就绪.pdf",
    sourceStatus: "ready",
    coverageStatus: "ready",
  });

  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async () => {
      throw new AuthError("expired cookie");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/chat`,
    headers: { authorization: authorizationFor(user) },
    payload: { message: "帮我总结" },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    code: "NOTEBOOKLM_AUTH_REQUIRED",
    error: "NotebookLM 连接已失效，请在服务器上重新连接后重试。",
  });
  assert.deepEqual(await db.select().from(conversations), []);

  await app.close();
});

test("历史遗留的非 owner JWT 也不能访问病例", async () => {
  const [intruder] = await db
    .insert(users)
    .values({ email: "intruder@example.com", name: "Intruder" })
    .returning();
  const [caseRecord] = await db
    .insert(cases)
    .values({
      userId: intruder.id,
      patientName: "不应访问",
      notebookId: "notebook-intruder",
    })
    .returning();

  let askCount = 0;
  const app = Fastify({ logger: false });
  await chatRoutes(app, {
    ask: async () => {
      askCount += 1;
      return { answer: "不应调用", references: [] };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/cases/${caseRecord.id}/chat`,
    headers: { authorization: authorizationFor(intruder) },
    payload: { message: "读取资料" },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(askCount, 0);

  await app.close();
});
