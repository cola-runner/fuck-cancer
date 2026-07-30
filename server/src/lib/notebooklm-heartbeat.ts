import { refreshNotebookLMSession } from "./notebooklm.js";

export const NOTEBOOKLM_HEARTBEAT_INTERVAL_MS = 8 * 60 * 1000;

type TimerHandle = unknown;

interface NotebookLMHeartbeatOptions {
  refresh?: () => Promise<void>;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
  onError?: (error: unknown) => void;
  intervalMs?: number;
}

interface NotebookLMHeartbeat {
  start(): void;
  stop(): Promise<void>;
}

function scheduleTimeout(
  callback: () => void,
  delayMs: number
): ReturnType<typeof setTimeout> {
  const timer = setTimeout(callback, delayMs);
  timer.unref();
  return timer;
}

function cancelTimeout(handle: TimerHandle): void {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

export function createNotebookLMHeartbeat(
  options: NotebookLMHeartbeatOptions = {}
): NotebookLMHeartbeat {
  const refresh = options.refresh ?? refreshNotebookLMSession;
  const schedule = options.schedule ?? scheduleTimeout;
  const cancel = options.cancel ?? cancelTimeout;
  const onError = options.onError ?? (() => undefined);
  const intervalMs =
    options.intervalMs ?? NOTEBOOKLM_HEARTBEAT_INTERVAL_MS;

  let stopped = true;
  let timerHandle: TimerHandle | undefined;
  let inFlight: Promise<void> | undefined;

  const scheduleNext = (): void => {
    if (stopped) return;
    timerHandle = schedule(() => {
      timerHandle = undefined;
      run();
    }, intervalMs);
  };

  const run = (): void => {
    if (stopped || inFlight) return;

    let refreshPromise: Promise<void>;
    try {
      refreshPromise = refresh();
    } catch (error) {
      refreshPromise = Promise.reject(error);
    }

    const currentRun = refreshPromise
      .catch((error) => {
        try {
          onError(error);
        } catch {
          // A logging failure must not break the heartbeat lifecycle.
        }
      })
      .finally(() => {
        if (inFlight === currentRun) inFlight = undefined;
        scheduleNext();
      });
    inFlight = currentRun;
  };

  return {
    start(): void {
      if (!stopped) return;
      stopped = false;
      run();
    },

    async stop(): Promise<void> {
      stopped = true;
      if (timerHandle !== undefined) {
        cancel(timerHandle);
        timerHandle = undefined;
      }
      await inFlight;
    },
  };
}
