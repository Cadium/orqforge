import Fastify from "fastify";
import { resolve } from "node:path";
import multipart from "@fastify/multipart";

import type { DeploymentRepository } from "./domain/deployment-repository.js";
import type { DeploymentLogRepository } from "./domain/deployment-log-repository.js";
import type { ImageBuilder } from "./domain/image-builder.js";
import type { ContainerRuntime } from "./domain/container-runtime.js";
import type { LogPublisher } from "./domain/log-publisher.js";
import type { IngressManager } from "./domain/ingress-manager.js";
import type { RouteVerifier } from "./domain/route-verifier.js";
import type { SourceMaterializer } from "./domain/source-materializer.js";
import { DeploymentExecutor } from "./application/deployment-executor.js";
import { DeploymentLogService } from "./application/deployment-log-service.js";
import { ValidationError } from "./domain/errors.js";
import { registerDeploymentRoutes } from "./interfaces/http/deployment-routes.js";
import { registerHealthRoutes } from "./interfaces/http/health-routes.js";
import { registerLogRoutes } from "./interfaces/http/log-routes.js";
import { registerUploadRoutes } from "./interfaces/http/upload-routes.js";
import { RailpackImageBuilder } from "./infrastructure/build/railpack-image-builder.js";
import { CaddyIngressManager } from "./infrastructure/ingress/caddy-ingress-manager.js";
import { InMemoryLogPublisher } from "./infrastructure/logging/in-memory-log-publisher.js";
import { DockerContainerRuntime } from "./infrastructure/runtime/docker-container-runtime.js";
import { DefaultSourceMaterializer } from "./infrastructure/source/default-source-materializer.js";
import { createDatabase } from "./infrastructure/sqlite/database.js";
import { SqliteDeploymentLogRepository } from "./infrastructure/sqlite/sqlite-deployment-log-repository.js";
import { SqliteDeploymentRepository } from "./infrastructure/sqlite/sqlite-deployment-repository.js";
import { HttpRouteVerifier } from "./infrastructure/verification/http-route-verifier.js";

interface BuildServerOptions {
  deploymentRepository?: DeploymentRepository;
  logRepository?: DeploymentLogRepository;
  logPublisher?: LogPublisher;
  deploymentExecutor?: DeploymentExecutor | null;
  sourceMaterializer?: SourceMaterializer;
  imageBuilder?: ImageBuilder;
  containerRuntime?: ContainerRuntime;
  ingressManager?: IngressManager;
  routeVerifier?: RouteVerifier;
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
  const sourceMaterializer =
    options.sourceMaterializer ??
    new DefaultSourceMaterializer({
      sampleAppsRoot: process.env.SAMPLE_APPS_ROOT ?? resolve(process.cwd(), "sample-apps"),
      workspaceRoot: process.env.WORKSPACES_ROOT ?? ".data/workspaces",
    });
  const imageBuilder = options.imageBuilder ?? new RailpackImageBuilder();
  const containerRuntime = options.containerRuntime ?? new DockerContainerRuntime();
  const ingressManager =
    options.ingressManager ??
    new CaddyIngressManager({
      routesDirectory: process.env.CADDY_ROUTES_DIR ?? "infra/caddy/routes",
      adminUrl: process.env.CADDY_ADMIN_URL ?? "http://caddy:2019",
      caddyfilePath: process.env.CADDY_CONFIG_PATH ?? undefined,
    });
  const routeVerifier =
    options.routeVerifier ??
    new HttpRouteVerifier({
      baseUrl: process.env.ORQFORGE_ROUTE_BASE_URL ?? "http://caddy",
    });

  void server.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 1,
    },
  });
  const deploymentExecutor =
    options.deploymentExecutor === null
      ? undefined
      : (options.deploymentExecutor ??
        new DeploymentExecutor(
          deploymentRepository,
          logService,
          logPublisher,
          sourceMaterializer,
          imageBuilder,
          containerRuntime,
          ingressManager,
          routeVerifier,
        ));

  server.get("/api", async () => ({
    name: "orqforge-api",
    status: "ok",
  }));

  registerHealthRoutes(server);
  registerDeploymentRoutes(server, { deploymentRepository, deploymentExecutor });
  registerLogRoutes(server, { logRepository, logPublisher });
  registerUploadRoutes(server, {
    uploadsRoot: process.env.UPLOADS_ROOT ?? ".data/uploads",
  });

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
