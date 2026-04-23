import Fastify from "fastify";

import type { DeploymentRepository } from "./domain/deployment-repository.js";
import type { DeploymentLogRepository } from "./domain/deployment-log-repository.js";
import type { LogPublisher } from "./domain/log-publisher.js";
import { DeploymentExecutor } from "./application/deployment-executor.js";
import { DeploymentLogService } from "./application/deployment-log-service.js";
import { ValidationError } from "./domain/errors.js";
import { registerDeploymentRoutes } from "./interfaces/http/deployment-routes.js";
import { registerHealthRoutes } from "./interfaces/http/health-routes.js";
import { registerLogRoutes } from "./interfaces/http/log-routes.js";
import { InMemoryLogPublisher } from "./infrastructure/logging/in-memory-log-publisher.js";
import { createDatabase } from "./infrastructure/sqlite/database.js";
import { SqliteDeploymentLogRepository } from "./infrastructure/sqlite/sqlite-deployment-log-repository.js";
import { SqliteDeploymentRepository } from "./infrastructure/sqlite/sqlite-deployment-repository.js";

interface BuildServerOptions {
  deploymentRepository?: DeploymentRepository;
  logRepository?: DeploymentLogRepository;
  logPublisher?: LogPublisher;
  deploymentExecutor?: DeploymentExecutor | null;
}

export function buildServer(options: BuildServerOptions = {}) {
  const server = Fastify({
    logger: true,
  });

  server.setErrorHandler((error, _request, reply) => {
    const statusCode = error instanceof ValidationError ? 400 : 500;
    const message = error instanceof Error ? error.message : "Unknown server error";

    reply.code(statusCode).send({
      message,
    });
  });

  const database =
    options.deploymentRepository && options.logRepository
      ? undefined
      : createDatabase(process.env.DATABASE_PATH ?? ".data/orqforge.sqlite");
  const deploymentRepository =
    options.deploymentRepository ?? new SqliteDeploymentRepository(getDatabase(database));
  const logRepository =
    options.logRepository ?? new SqliteDeploymentLogRepository(getDatabase(database));
  const logPublisher = options.logPublisher ?? new InMemoryLogPublisher();
  const logService = new DeploymentLogService(logRepository, logPublisher);
  const deploymentExecutor =
    options.deploymentExecutor === null
      ? undefined
      : (options.deploymentExecutor ??
        new DeploymentExecutor(deploymentRepository, logService, logPublisher));

  server.get("/api", async () => ({
    name: "orqforge-api",
    status: "ok",
  }));

  registerHealthRoutes(server);
  registerDeploymentRoutes(server, { deploymentRepository, deploymentExecutor });
  registerLogRoutes(server, { logRepository, logPublisher });

  return server;
}

function getDatabase(database: ReturnType<typeof createDatabase> | undefined) {
  if (!database) {
    throw new Error(
      "A database-backed Orqforge server requires both repositories or a database path",
    );
  }

  return database;
}
