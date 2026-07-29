import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import Fastify from "fastify";
import { and, eq } from "drizzle-orm";

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
  { coverDrugsFromDocument, importedSourcesReady },
] = await Promise.all([
  import("../src/db/index.js"),
  import("../src/db/schema.js"),
  import("../src/lib/drug-coverage.js"),
]);

const { users, cases, documents, caseDrugs } = schema;
const logger = Fastify({ logger: false }).log;

beforeEach(async () => {
  await db.delete(users);
});

async function createCase() {
  const [user] = await db
    .insert(users)
    .values({ email: "owner@example.com" })
    .returning();
  const [caseRecord] = await db
    .insert(cases)
    .values({
      userId: user.id,
      patientName: "患者",
      notebookId: "notebook-1",
    })
    .returning();
  return caseRecord;
}

test("自动导入首次失败会在同一任务内重试，成功后保留去重记录", async () => {
  const caseRecord = await createCase();
  let importCalls = 0;

  const covered = await coverDrugsFromDocument(
    "document-1",
    caseRecord.id,
    "notebook-1",
    "source-1",
    logger,
    {
      ask: async () => ({ answer: "奥沙利铂" }),
      importOfficialSources: async () => {
        importCalls += 1;
        return importCalls === 2;
      },
    }
  );

  assert.equal(importCalls, 2);
  assert.equal(covered, true);
  const claims = await db
    .select()
    .from(caseDrugs)
    .where(
      and(
        eq(caseDrugs.caseId, caseRecord.id),
        eq(caseDrugs.drugName, "奥沙利铂")
      )
  );
  assert.equal(claims.length, 1);
});

test("自动导入进行中不写持久去重记录，进程中断后不会留下假成功", async () => {
  const caseRecord = await createCase();
  let signalImportStarted!: () => void;
  let finishImport!: (ready: boolean) => void;
  const importStarted = new Promise<void>((resolve) => {
    signalImportStarted = resolve;
  });
  const importFinished = new Promise<boolean>((resolve) => {
    finishImport = resolve;
  });

  const coverage = coverDrugsFromDocument(
    "document-pending",
    caseRecord.id,
    "notebook-1",
    "source-pending",
    logger,
    {
      ask: async () => ({ answer: "奥沙利铂" }),
      importOfficialSources: async () => {
        signalImportStarted();
        return importFinished;
      },
    }
  );

  await importStarted;
  assert.equal(
    (
      await db
        .select()
        .from(caseDrugs)
        .where(eq(caseDrugs.caseId, caseRecord.id))
    ).length,
    0
  );

  finishImport(true);
  await coverage;
  assert.equal(
    (
      await db
        .select()
        .from(caseDrugs)
        .where(eq(caseDrugs.caseId, caseRecord.id))
    ).length,
    1
  );
});

test("自动导入连续失败会明确返回失败，后续任务能够再次尝试", async () => {
  const caseRecord = await createCase();
  let importCalls = 0;
  let shouldSucceed = false;
  const options = {
    ask: async () => ({ answer: "奥沙利铂" }),
    importOfficialSources: async () => {
      importCalls += 1;
      return shouldSucceed;
    },
  };

  const firstCoverage = await coverDrugsFromDocument(
    "document-1",
    caseRecord.id,
    "notebook-1",
    "source-1",
    logger,
    options
  );
  assert.equal(importCalls, 2);
  assert.equal(firstCoverage, false);
  assert.equal(
    (
      await db
        .select()
        .from(caseDrugs)
        .where(eq(caseDrugs.caseId, caseRecord.id))
    ).length,
    0
  );

  shouldSucceed = true;
  const secondCoverage = await coverDrugsFromDocument(
    "document-1",
    caseRecord.id,
    "notebook-1",
    "source-1",
    logger,
    options
  );

  assert.equal(importCalls, 3);
  assert.equal(secondCoverage, true);
  assert.equal(
    (
      await db
        .select()
        .from(caseDrugs)
        .where(eq(caseDrugs.caseId, caseRecord.id))
    ).length,
    1
  );
});

test("药名提取失败会明确返回失败，不会被当成覆盖完成", async () => {
  const caseRecord = await createCase();

  const covered = await coverDrugsFromDocument(
    "document-extraction-error",
    caseRecord.id,
    "notebook-1",
    "source-extraction-error",
    logger,
    {
      ask: async () => {
        throw new Error("extraction unavailable");
      },
      importOfficialSources: async () => true,
    }
  );

  assert.equal(covered, false);
  assert.equal(
    (
      await db
        .select()
        .from(caseDrugs)
        .where(eq(caseDrugs.caseId, caseRecord.id))
    ).length,
    0
  );
});

test("已经成功覆盖的药品不会重复导入", async () => {
  const caseRecord = await createCase();
  await db
    .insert(caseDrugs)
    .values({ caseId: caseRecord.id, drugName: "奥沙利铂" });
  let importCalls = 0;

  await coverDrugsFromDocument(
    "document-2",
    caseRecord.id,
    "notebook-1",
    "source-2",
    logger,
    {
      ask: async () => ({ answer: "奥沙利铂" }),
      importOfficialSources: async () => {
        importCalls += 1;
        return true;
      },
    }
  );

  assert.equal(importCalls, 0);
});

test("远端已接受导入但来源处理失败时不能视为覆盖成功", async () => {
  const tracked: string[] = [];
  const ready = await importedSourcesReady(
    [
      { documentId: "document-a", sourceId: "source-a" },
      { documentId: "document-b", sourceId: "source-b" },
    ],
    "notebook-1",
    logger,
    async (documentId) => {
      tracked.push(documentId);
      return false;
    }
  );

  assert.equal(ready, false);
  assert.deepEqual(tracked.sort(), ["document-a", "document-b"]);
});

test("至少一个导入来源处理完成后才视为覆盖成功", async () => {
  const ready = await importedSourcesReady(
    [
      { documentId: "document-a", sourceId: "source-a" },
      { documentId: "document-b", sourceId: "source-b" },
    ],
    "notebook-1",
    logger,
    async (documentId) => documentId === "document-b"
  );

  assert.equal(ready, true);
});

test("自动来源处理失败时仅在远端删除成功后移除本地索引", async () => {
  const caseRecord = await createCase();
  const [doc] = await db
    .insert(documents)
    .values({
      caseId: caseRecord.id,
      sourceId: "failed-source",
      fileName: "失败的自动资料",
      origin: "auto",
      sourceStatus: "processing",
    })
    .returning();
  let remoteDeleted = false;

  await importedSourcesReady(
    [{ documentId: doc.id, sourceId: "failed-source" }],
    "notebook-1",
    logger,
    async () => false,
    async () => remoteDeleted
  );

  assert.equal(
    (
      await db
        .select()
        .from(documents)
        .where(eq(documents.id, doc.id))
    ).length,
    1
  );

  remoteDeleted = true;
  await importedSourcesReady(
    [{ documentId: doc.id, sourceId: "failed-source" }],
    "notebook-1",
    logger,
    async () => false,
    async () => remoteDeleted
  );

  assert.equal(
    (
      await db
        .select()
        .from(documents)
        .where(eq(documents.id, doc.id))
    ).length,
    0
  );
});

test("同批自动来源部分成功时清理失败项并保留已就绪项", async () => {
  const caseRecord = await createCase();
  const [failedDoc, readyDoc] = await db
    .insert(documents)
    .values([
      {
        caseId: caseRecord.id,
        sourceId: "failed-source",
        fileName: "失败资料",
        origin: "auto",
        sourceStatus: "processing",
      },
      {
        caseId: caseRecord.id,
        sourceId: "ready-source",
        fileName: "就绪资料",
        origin: "auto",
        sourceStatus: "processing",
      },
    ])
    .returning();
  const deletedSourceIds: string[] = [];

  const ready = await importedSourcesReady(
    [
      { documentId: failedDoc.id, sourceId: "failed-source" },
      { documentId: readyDoc.id, sourceId: "ready-source" },
    ],
    "notebook-1",
    logger,
    async (_documentId, _notebookId, sourceId) =>
      sourceId === "ready-source",
    async (_notebookId, sourceId) => {
      deletedSourceIds.push(sourceId);
      return true;
    }
  );

  assert.equal(ready, true);
  assert.deepEqual(deletedSourceIds, ["failed-source"]);
  assert.deepEqual(
    (await db.select().from(documents)).map((document) => document.id),
    [readyDoc.id]
  );
});
