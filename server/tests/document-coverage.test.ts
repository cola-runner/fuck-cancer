import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import Fastify from "fastify";
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

const [{ db }, schema, { trackAndCover }] = await Promise.all([
  import("../src/db/index.js"),
  import("../src/db/schema.js"),
  import("../src/routes/documents.js"),
]);

const { users, cases, documents } = schema;
const logger = Fastify({ logger: false }).log;

beforeEach(async () => {
  await db.delete(users);
});

async function createDocument() {
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
  const [document] = await db
    .insert(documents)
    .values({
      caseId: caseRecord.id,
      sourceId: "source-1",
      fileName: "病历.pdf",
      sourceStatus: "ready",
      coverageStatus: "ready",
    })
    .returning();
  return { caseRecord, document };
}

test("用户资料在药品覆盖完成前保持 pending，失败后可明确重试", async () => {
  const { caseRecord, document } = await createDocument();
  let signalCoverageStarted!: () => void;
  let finishCoverage!: (covered: boolean) => void;
  const coverageStarted = new Promise<void>((resolve) => {
    signalCoverageStarted = resolve;
  });
  const coverageFinished = new Promise<boolean>((resolve) => {
    finishCoverage = resolve;
  });

  const task = trackAndCover(
    document.id,
    caseRecord.id,
    "notebook-1",
    "source-1",
    logger,
    {
      trackSource: async () => true,
      coverDrugs: async () => {
        signalCoverageStarted();
        return coverageFinished;
      },
    }
  );

  await coverageStarted;
  let [stored] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, document.id));
  assert.equal(stored.coverageStatus, "pending");
  assert.equal(stored.coverageError, null);

  finishCoverage(false);
  await task;
  [stored] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, document.id));
  assert.equal(stored.coverageStatus, "error");
  assert.match(stored.coverageError ?? "", /用药资料/);

  await trackAndCover(
    document.id,
    caseRecord.id,
    "notebook-1",
    "source-1",
    logger,
    {
      trackSource: async () => true,
      coverDrugs: async () => true,
    }
  );
  [stored] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, document.id));
  assert.equal(stored.coverageStatus, "ready");
  assert.equal(stored.coverageError, null);
});

test("NotebookLM 来源处理失败时覆盖状态也不会停留在 pending", async () => {
  const { caseRecord, document } = await createDocument();

  await trackAndCover(
    document.id,
    caseRecord.id,
    "notebook-1",
    "source-1",
    logger,
    {
      trackSource: async () => false,
      coverDrugs: async () => {
        throw new Error("must not run");
      },
    }
  );

  const [stored] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, document.id));
  assert.equal(stored.coverageStatus, "error");
});
