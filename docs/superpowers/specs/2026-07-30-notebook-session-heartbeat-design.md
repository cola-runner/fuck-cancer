# Notebook session heartbeat

## Goal

Keep an already-valid Notebook session fresh while the single self-hosted
server process is running. The heartbeat must not read notebook titles, sources,
or medical content.

## Design

- Start one heartbeat loop after Fastify starts listening.
- Run once immediately, then schedule the next run eight minutes after the
  previous run finishes so heartbeats never overlap.
- Refresh only the authentication homepage through
  `client.session.refreshTokens()`. This triggers the CLI core's existing
  `RotateCookies` flow without calling `notebooks.list()`.
- Execute through `withNotebookLM()` so rotated cookies use the existing
  client-entry guard and serialized atomic save path.
- Treat heartbeat errors as non-fatal: log only the error class/state, never raw
  responses, cookies, tokens, notebook metadata, or medical content.
- Stop scheduling and await an in-flight heartbeat during Fastify shutdown.
- Keep the deployment single-instance while one session file is shared.

## Non-goals

- Reviving a session already rejected by Google.
- Keeping a session alive while the host is stopped or asleep.
- Changing the CLI package, UI, database, authentication model, or deployment
  topology.
- Adding multi-process file locking.

## Verification

- Unit-test immediate execution, delayed rescheduling, no overlap, graceful
  stop, and non-fatal failures using an injected scheduler.
- Unit-test that a heartbeat refreshes auth and persists through the existing
  session wrapper without reading notebooks.
- Run the existing server and web suites and builds.
- After re-importing a valid browser session, perform a soak check longer than
  the previous 68-minute failure window while confirming the session file stays
  mode `0600` and logs contain no sensitive values.
