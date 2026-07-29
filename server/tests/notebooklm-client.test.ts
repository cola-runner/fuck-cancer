import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AuthError,
  GeminiNotebookClient,
} from "@cola_runner/gemini-notebook-cli";

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

const { getNotebookLM, resetNotebookLM, withNotebookLM } = await import(
  "../src/lib/notebooklm.js"
);

test("成功调用 Notebook 后持久化轮换后的会话 Cookie", async () => {
  let saveCount = 0;
  const client = {
    save: async () => {
      saveCount += 1;
    },
  } as unknown as GeminiNotebookClient;
  const original = Object.getOwnPropertyDescriptor(
    GeminiNotebookClient,
    "fromStorage"
  );
  Object.defineProperty(GeminiNotebookClient, "fromStorage", {
    configurable: true,
    value: async () => client,
  });
  resetNotebookLM();

  try {
    const result = await withNotebookLM(async (activeClient) => {
      assert.equal(activeClient, client);
      return "ok";
    });

    assert.equal(result, "ok");
    assert.equal(saveCount, 1);
  } finally {
    resetNotebookLM();
    if (original) {
      Object.defineProperty(GeminiNotebookClient, "fromStorage", original);
    }
  }
});

test("并发 Notebook 操作不会并发覆盖同一个会话文件", async () => {
  let saveCount = 0;
  let activeSaves = 0;
  let maxActiveSaves = 0;
  const client = {
    save: async () => {
      saveCount += 1;
      activeSaves += 1;
      maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
      await Promise.resolve();
      activeSaves -= 1;
    },
  } as unknown as GeminiNotebookClient;
  const original = Object.getOwnPropertyDescriptor(
    GeminiNotebookClient,
    "fromStorage"
  );
  Object.defineProperty(GeminiNotebookClient, "fromStorage", {
    configurable: true,
    value: async () => client,
  });
  resetNotebookLM();

  try {
    await Promise.all([
      withNotebookLM(async () => "first"),
      withNotebookLM(async () => "second"),
    ]);

    assert.equal(maxActiveSaves, 1);
    assert.equal(saveCount, 2);
  } finally {
    resetNotebookLM();
    if (original) {
      Object.defineProperty(GeminiNotebookClient, "fromStorage", original);
    }
  }
});

test("会话落盘失败不推翻已经成功的 Notebook 操作", async () => {
  let operationCount = 0;
  let saveCount = 0;
  const client = {
    save: async () => {
      saveCount += 1;
      throw new Error("simulated storage failure");
    },
  } as unknown as GeminiNotebookClient;
  const original = Object.getOwnPropertyDescriptor(
    GeminiNotebookClient,
    "fromStorage"
  );
  const originalConsoleError = console.error;
  Object.defineProperty(GeminiNotebookClient, "fromStorage", {
    configurable: true,
    value: async () => client,
  });
  console.error = () => undefined;
  resetNotebookLM();

  try {
    const result = await withNotebookLM(async () => {
      operationCount += 1;
      return "remote-success";
    });

    assert.equal(result, "remote-success");
    assert.equal(operationCount, 1);
    assert.equal(saveCount, 1);
  } finally {
    console.error = originalConsoleError;
    resetNotebookLM();
    if (original) {
      Object.defineProperty(GeminiNotebookClient, "fromStorage", original);
    }
  }
});

test("一次会话落盘失败不会阻塞后续保存", async () => {
  let saveCount = 0;
  const client = {
    save: async () => {
      saveCount += 1;
      if (saveCount === 1) throw new Error("simulated storage failure");
    },
  } as unknown as GeminiNotebookClient;
  const original = Object.getOwnPropertyDescriptor(
    GeminiNotebookClient,
    "fromStorage"
  );
  const originalConsoleError = console.error;
  Object.defineProperty(GeminiNotebookClient, "fromStorage", {
    configurable: true,
    value: async () => client,
  });
  console.error = () => undefined;
  resetNotebookLM();

  try {
    await withNotebookLM(async () => "first");
    await withNotebookLM(async () => "second");
    assert.equal(saveCount, 2);
  } finally {
    console.error = originalConsoleError;
    resetNotebookLM();
    if (original) {
      Object.defineProperty(GeminiNotebookClient, "fromStorage", original);
    }
  }
});

test("鉴权重建后旧客户端不能覆盖新会话", async () => {
  const savedClients: string[] = [];
  let releaseOldOperation: (() => void) | undefined;
  let markOldOperationStarted: (() => void) | undefined;
  const oldOperationStarted = new Promise<void>((resolve) => {
    markOldOperationStarted = resolve;
  });
  const oldOperationRelease = new Promise<void>((resolve) => {
    releaseOldOperation = resolve;
  });
  const oldClient = {
    save: async () => {
      savedClients.push("old");
    },
  } as unknown as GeminiNotebookClient;
  const newClient = {
    save: async () => {
      savedClients.push("new");
    },
  } as unknown as GeminiNotebookClient;
  const clients = [oldClient, newClient];
  let clientIndex = 0;
  const original = Object.getOwnPropertyDescriptor(
    GeminiNotebookClient,
    "fromStorage"
  );
  Object.defineProperty(GeminiNotebookClient, "fromStorage", {
    configurable: true,
    value: async () => clients[clientIndex++] ?? newClient,
  });
  resetNotebookLM();

  const oldOperation = withNotebookLM(async (client) => {
    assert.equal(client, oldClient);
    markOldOperationStarted?.();
    await oldOperationRelease;
    return "old-result";
  });

  try {
    await oldOperationStarted;
    const recovered = await withNotebookLM(async (client) => {
      if (client === oldClient) throw new AuthError("expired");
      assert.equal(client, newClient);
      return "new-result";
    });
    assert.equal(recovered, "new-result");

    releaseOldOperation?.();
    assert.equal(await oldOperation, "old-result");
    assert.deepEqual(savedClients, ["new"]);
  } finally {
    releaseOldOperation?.();
    await oldOperation.catch(() => undefined);
    resetNotebookLM();
    if (original) {
      Object.defineProperty(GeminiNotebookClient, "fromStorage", original);
    }
  }
});

test("两个旧请求同时鉴权失败时只重建一个新客户端", async () => {
  const savedClients: string[] = [];
  let releaseFirstOperation: (() => void) | undefined;
  let releaseSecondOperation: (() => void) | undefined;
  let markFirstOperationStarted: (() => void) | undefined;
  let markSecondOperationStarted: (() => void) | undefined;
  let resolveRebuiltClient:
    | ((client: GeminiNotebookClient) => void)
    | undefined;
  let markRebuildStarted: (() => void) | undefined;

  const firstOperationStarted = new Promise<void>((resolve) => {
    markFirstOperationStarted = resolve;
  });
  const secondOperationStarted = new Promise<void>((resolve) => {
    markSecondOperationStarted = resolve;
  });
  const firstOperationRelease = new Promise<void>((resolve) => {
    releaseFirstOperation = resolve;
  });
  const secondOperationRelease = new Promise<void>((resolve) => {
    releaseSecondOperation = resolve;
  });
  const rebuildStarted = new Promise<void>((resolve) => {
    markRebuildStarted = resolve;
  });
  const rebuiltClientPromise = new Promise<GeminiNotebookClient>((resolve) => {
    resolveRebuiltClient = resolve;
  });

  const makeClient = (name: string) =>
    ({
      name,
      save: async () => {
        savedClients.push(name);
      },
    }) as unknown as GeminiNotebookClient;
  const initialClient = makeClient("initial");
  const rebuiltClient = makeClient("rebuilt");
  let buildCount = 0;
  const original = Object.getOwnPropertyDescriptor(
    GeminiNotebookClient,
    "fromStorage"
  );
  Object.defineProperty(GeminiNotebookClient, "fromStorage", {
    configurable: true,
    value: () => {
      buildCount += 1;
      if (buildCount === 1) return Promise.resolve(initialClient);
      markRebuildStarted?.();
      return rebuiltClientPromise;
    },
  });
  resetNotebookLM();

  const firstOperation = withNotebookLM(async (client) => {
    if (client === initialClient) {
      markFirstOperationStarted?.();
      await firstOperationRelease;
      throw new AuthError("expired-first");
    }
    return client;
  });
  const secondOperation = withNotebookLM(async (client) => {
    if (client === initialClient) {
      markSecondOperationStarted?.();
      await secondOperationRelease;
      throw new AuthError("expired-second");
    }
    return client;
  });

  try {
    await Promise.all([firstOperationStarted, secondOperationStarted]);
    releaseFirstOperation?.();
    await rebuildStarted;
    releaseSecondOperation?.();
    await Promise.resolve();
    assert.equal(buildCount, 2);

    resolveRebuiltClient?.(rebuiltClient);
    assert.equal(await firstOperation, rebuiltClient);
    assert.equal(await secondOperation, rebuiltClient);
    assert.deepEqual(savedClients, ["rebuilt", "rebuilt"]);
  } finally {
    releaseFirstOperation?.();
    releaseSecondOperation?.();
    resolveRebuiltClient?.(rebuiltClient);
    await Promise.allSettled([firstOperation, secondOperation]);
    resetNotebookLM();
    if (original) {
      Object.defineProperty(GeminiNotebookClient, "fromStorage", original);
    }
  }
});

test("过期客户端构建失败不能清除更新的客户端", async () => {
  let rejectStaleBuild: ((reason: Error) => void) | undefined;
  let resolveCurrentBuild:
    | ((client: GeminiNotebookClient) => void)
    | undefined;
  const staleBuild = new Promise<GeminiNotebookClient>((_resolve, reject) => {
    rejectStaleBuild = reject;
  });
  const currentBuild = new Promise<GeminiNotebookClient>((resolve) => {
    resolveCurrentBuild = resolve;
  });
  const currentClient = {
    save: async () => undefined,
  } as unknown as GeminiNotebookClient;
  const unexpectedClient = {
    save: async () => undefined,
  } as unknown as GeminiNotebookClient;
  let buildCount = 0;
  const original = Object.getOwnPropertyDescriptor(
    GeminiNotebookClient,
    "fromStorage"
  );
  Object.defineProperty(GeminiNotebookClient, "fromStorage", {
    configurable: true,
    value: () => {
      buildCount += 1;
      if (buildCount === 1) return staleBuild;
      if (buildCount === 2) return currentBuild;
      return Promise.resolve(unexpectedClient);
    },
  });
  resetNotebookLM();

  const staleClientPromise = getNotebookLM();
  resetNotebookLM();
  const currentClientPromise = getNotebookLM();

  try {
    const staleRejection = assert.rejects(
      staleClientPromise,
      /stale bootstrap failed/
    );
    rejectStaleBuild?.(new Error("stale bootstrap failed"));
    await staleRejection;

    const sharedCurrentClientPromise = getNotebookLM();
    resolveCurrentBuild?.(currentClient);

    assert.equal(await currentClientPromise, currentClient);
    assert.equal(await sharedCurrentClientPromise, currentClient);
    assert.equal(buildCount, 2);
  } finally {
    rejectStaleBuild?.(new Error("cleanup"));
    resolveCurrentBuild?.(currentClient);
    await Promise.allSettled([staleClientPromise, currentClientPromise]);
    resetNotebookLM();
    if (original) {
      Object.defineProperty(GeminiNotebookClient, "fromStorage", original);
    }
  }
});
