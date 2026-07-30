import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import {
  NOTEBOOKLM_HEARTBEAT_INTERVAL_MS,
  createNotebookLMHeartbeat,
} from "../src/lib/notebooklm-heartbeat.js";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("心跳立即刷新，并在本次完成八分钟后再运行一次", async () => {
  const runs = [deferred(), deferred()];
  const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
  let refreshCount = 0;
  const heartbeat = createNotebookLMHeartbeat({
    refresh: () => {
      const run = runs[refreshCount];
      refreshCount += 1;
      return run.promise;
    },
    schedule: (callback, delayMs) => {
      scheduled.push({ callback, delayMs });
      return scheduled.length;
    },
    cancel: () => undefined,
  });

  heartbeat.start();
  assert.equal(refreshCount, 1);
  assert.equal(scheduled.length, 0);

  runs[0].resolve();
  await setImmediate();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 8 * 60 * 1000);
  assert.equal(
    scheduled[0].delayMs,
    NOTEBOOKLM_HEARTBEAT_INTERVAL_MS
  );

  scheduled[0].callback();
  assert.equal(refreshCount, 2);
  assert.equal(scheduled.length, 1);

  const stopPromise = heartbeat.stop();
  runs[1].resolve();
  await stopPromise;
});

test("刷新失败会报告错误并继续安排下一次心跳", async () => {
  const failure = new Error("refresh failed");
  const errors: unknown[] = [];
  const delays: number[] = [];
  const heartbeat = createNotebookLMHeartbeat({
    refresh: async () => {
      throw failure;
    },
    schedule: (_callback, delayMs) => {
      delays.push(delayMs);
      return "timer";
    },
    cancel: () => undefined,
    onError: (error) => {
      errors.push(error);
    },
  });

  heartbeat.start();
  await setImmediate();

  assert.deepEqual(errors, [failure]);
  assert.deepEqual(delays, [NOTEBOOKLM_HEARTBEAT_INTERVAL_MS]);
  await heartbeat.stop();
});

test("停止心跳会取消定时器", async () => {
  const cancelled: unknown[] = [];
  let scheduledCallback: (() => void) | undefined;
  let refreshCount = 0;
  const heartbeat = createNotebookLMHeartbeat({
    refresh: async () => {
      refreshCount += 1;
    },
    schedule: (callback) => {
      scheduledCallback = callback;
      return "pending-timer";
    },
    cancel: (handle) => {
      cancelled.push(handle);
    },
  });

  heartbeat.start();
  await setImmediate();
  await heartbeat.stop();

  assert.deepEqual(cancelled, ["pending-timer"]);
  scheduledCallback?.();
  assert.equal(refreshCount, 1);
});

test("停止心跳会等待正在进行的刷新且不会重新调度", async () => {
  const run = deferred();
  let scheduledCount = 0;
  let stopped = false;
  const heartbeat = createNotebookLMHeartbeat({
    refresh: () => run.promise,
    schedule: () => {
      scheduledCount += 1;
      return "timer";
    },
    cancel: () => undefined,
  });

  heartbeat.start();
  const stopPromise = heartbeat.stop().then(() => {
    stopped = true;
  });
  await setImmediate();
  assert.equal(stopped, false);

  run.resolve();
  await stopPromise;
  assert.equal(stopped, true);
  assert.equal(scheduledCount, 0);
});
