import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";

import { config } from "./lib/config.js";
import { hardenRuntimePermissions } from "./lib/file-security.js";
import { authRoutes } from "./routes/auth.js";
import { casesRoutes } from "./routes/cases.js";
import { documentsRoutes } from "./routes/documents.js";
import { chatRoutes } from "./routes/chat.js";
import { researchRoutes } from "./routes/research.js";
import { settingsRoutes } from "./routes/settings.js";

const fastify = Fastify({
  logger: {
    level: config.logLevel,
    transport:
      config.nodeEnv !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
});

async function start(): Promise<void> {
  hardenRuntimePermissions({
    databasePath: config.databasePath,
    notebooklmStoragePath: config.notebooklmStoragePath,
  });

  // Register plugins
  await fastify.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  await fastify.register(cookie, { secret: config.jwtSecret });

  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB
    },
  });

  // Health check
  fastify.get("/api/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      mode: "self-hosted",
    };
  });

  // Register routes
  await fastify.register(authRoutes);
  await fastify.register(casesRoutes);
  await fastify.register(documentsRoutes);
  await fastify.register(chatRoutes);
  await fastify.register(researchRoutes);
  await fastify.register(settingsRoutes);

  // Start server
  const port = config.port;
  const host = config.host;

  await fastify.listen({ port, host });
  fastify.log.info(`Server running at http://${host}:${port}`);
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
