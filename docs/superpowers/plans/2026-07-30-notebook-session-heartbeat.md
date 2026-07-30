# Notebook Session Heartbeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a valid Notebook session fresh while the single self-hosted server process is running.

**Architecture:** Add one authentication-only refresh operation to the existing entry-aware Notebook wrapper, then call it from a small recursive timer. Wire the timer into Fastify start/close without changing UI, database, CLI package, or deployment topology.

**Tech Stack:** TypeScript, Node.js timers, Fastify lifecycle hooks, Node test runner.

## Global Constraints

- Do not call `notebooks.list()`, chat, sources, or any medical-data API from the heartbeat.
- Run immediately after the server listens, then eight minutes after each completed run.
- Never overlap heartbeat runs.
- Heartbeat failure must not crash startup or normal requests.
- Never log cookies, tokens, raw responses, Notebook metadata, file paths, or medical content.
- Reuse `withNotebookLM()` so saves remain serialized and protected by client-entry identity.
- Keep the deployment single-instance; do not add CLI, UI, database, Compose, or multi-process locking changes.

---

### Task 1: Authentication-only refresh operation

**Files:**
- Modify: `server/src/lib/notebooklm.ts`
- Test: `server/tests/notebooklm-client.test.ts`

**Interfaces:**
- Produces: `refreshNotebookLMSession(): Promise<void>`
- Consumes: existing `withNotebookLM()` and `GeminiNotebookClient.session.refreshTokens()`

- [ ] **Step 1: Write the failing test**

Add a test that stubs `GeminiNotebookClient.fromStorage()` with a client whose
`session.refreshTokens()` and `save()` increment counters, while
`notebooks.list()` throws if called:

```ts
const client = {
  session: {
    refreshTokens: async () => {
      refreshCount += 1;
      return { csrf: "test", sessionId: "test", extractedAt: Date.now() };
    },
  },
  notebooks: {
    list: async () => {
      throw new Error("heartbeat must not list notebooks");
    },
  },
  save: async () => {
    saveCount += 1;
  },
} as unknown as GeminiNotebookClient;

await refreshNotebookLMSession();
assert.equal(refreshCount, 1);
assert.equal(saveCount, 1);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd server
node --import tsx --test --test-concurrency=1 \
  --test-name-pattern='后台心跳只刷新认证' \
  tests/notebooklm-client.test.ts
```

Expected: FAIL because `refreshNotebookLMSession` is not exported.

- [ ] **Step 3: Implement the minimal refresh operation**

Add to `server/src/lib/notebooklm.ts`:

```ts
export async function refreshNotebookLMSession(): Promise<void> {
  await withNotebookLM(async (client) => {
    await client.session.refreshTokens();
  });
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same focused command. Expected: one passing test, with one refresh and
one serialized save.

### Task 2: Non-overlapping recursive heartbeat

**Files:**
- Create: `server/src/lib/notebooklm-heartbeat.ts`
- Create: `server/tests/notebooklm-heartbeat.test.ts`

**Interfaces:**
- Produces:
  - `NOTEBOOKLM_HEARTBEAT_INTERVAL_MS = 8 * 60 * 1000`
  - `createNotebookLMHeartbeat(options): { start(): void; stop(): Promise<void> }`
- Consumes: `refreshNotebookLMSession(): Promise<void>`

- [ ] **Step 1: Write failing scheduler tests**

Use injected `refresh`, `schedule`, and `cancel` functions. Cover:

```ts
const heartbeat = createNotebookLMHeartbeat({
  refresh,
  schedule: (callback, delayMs) => {
    scheduledCallback = callback;
    scheduledDelay = delayMs;
    return "timer";
  },
  cancel: (handle) => cancelled.push(handle),
  onError: (error) => errors.push(error),
});
```

Assert:

- `start()` calls `refresh()` immediately.
- The next callback is scheduled for exactly
  `NOTEBOOKLM_HEARTBEAT_INTERVAL_MS` only after refresh settles.
- Invoking the callback starts exactly one later refresh.
- A rejected refresh is reported through `onError` and still schedules the next
  run.
- `stop()` cancels a pending timer, waits for an in-flight refresh, and prevents
  another schedule.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd server
node --import tsx --test --test-concurrency=1 \
  tests/notebooklm-heartbeat.test.ts
```

Expected: FAIL because the heartbeat module does not exist.

- [ ] **Step 3: Implement the controller**

Implement a recursive `setTimeout`, not `setInterval`. Keep `stopped`,
`timerHandle`, and `inFlight` private to the factory. The production scheduler
must call `unref()` on the Node timeout. Swallow refresh failures after invoking
the safe `onError` callback, and schedule the next run in `finally` only when
not stopped.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same focused command. Expected: all scheduler lifecycle tests pass
without real time delays.

### Task 3: Fastify lifecycle wiring

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/tests/deployment.test.ts`

**Interfaces:**
- Consumes: `createNotebookLMHeartbeat()`
- Produces: one process-wide heartbeat started after `fastify.listen()` and
  stopped from Fastify's `onClose` hook.

- [ ] **Step 1: Add a failing wiring regression**

Extend the deployment test to assert that `server/src/index.ts`:

- creates the Notebook heartbeat,
- registers `heartbeat.stop()` in `onClose`,
- calls `heartbeat.start()` after `await fastify.listen(...)`,
- logs only a safe error class from `onError`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd server
node --import tsx --test --test-concurrency=1 \
  --test-name-pattern='server lifecycle starts and stops the Notebook heartbeat' \
  tests/deployment.test.ts
```

Expected: FAIL because the server has no heartbeat wiring.

- [ ] **Step 3: Wire the heartbeat**

Create one controller beside the Fastify instance. Its `onError` callback may
log only:

```ts
{
  errorType: error instanceof Error ? error.name : "UnknownError",
}
```

Register `onClose` before listening. Call `start()` only after
`fastify.listen()` resolves.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
cd server
npm test
npm run build
cd ../web
npm test
npm run build
npm run lint
cd ..
git diff --check
```

Expected: server 70+ tests pass, web 13 tests pass, builds and lint exit zero.

- [ ] **Step 5: Commit**

Stage only the plan, heartbeat implementation, lifecycle wiring, and their
tests. Confirm no session, `.env`, SQLite, or `.superpowers` files are staged.
Commit:

```bash
git commit -m "fix: keep Notebook session fresh while idle"
```
