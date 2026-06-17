import { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { isNotebookLMConnected } from "../lib/notebooklm.js";

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", authMiddleware);

  // The app no longer holds any AI/storage API keys — all intelligence comes
  // from the server-side NotebookLM session. Settings just reports its health.
  // This makes a real RPC (not just a client construction) so an expired
  // session reads as disconnected instead of a false "connected".
  fastify.get("/api/settings", async (_request, reply) => {
    const notebooklmConnected = await isNotebookLMConnected();

    return reply.send({
      notebooklm: {
        connected: notebooklmConnected,
        hint: notebooklmConnected
          ? null
          : "Run `npx @cola_runner/notebooklm-cli login` on the server host to connect NotebookLM.",
      },
    });
  });
}
