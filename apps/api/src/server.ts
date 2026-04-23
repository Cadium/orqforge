import Fastify from "fastify";

import type { DeploymentRepository } from "./domain/deployment-repository.js";
import { ValidationError } from "./domain/errors.js";
import { registerDeploymentRoutes } from "./interfaces/http/deployment-routes.js";
import { registerHealthRoutes } from "./interfaces/http/health-routes.js";
import { createDatabase } from "./infrastructure/sqlite/database.js";
import { SqliteDeploymentRepository } from "./infrastructure/sqlite/sqlite-deployment-repository.js";

interface BuildServerOptions {
  deploymentRepository?: DeploymentRepository;
}

export function buildServer(options: BuildServerOptions = {}) {
  const server = Fastify({
    logger: true,
  });

  server.setErrorHandler((error, _request, reply) => {
    const statusCode = error instanceof ValidationError ? 400 : 500;

    reply.code(statusCode).send({
      message: error.message,
    });
  });

  const deploymentRepository =
    options.deploymentRepository ??
    new SqliteDeploymentRepository(
      createDatabase(process.env.DATABASE_PATH ?? ".data/orqforge.sqlite"),
    );

  server.get("/api", async () => ({
    name: "orqforge-api",
    status: "ok",
  }));

  registerHealthRoutes(server);
  registerDeploymentRoutes(server, { deploymentRepository });

  return server;
}
