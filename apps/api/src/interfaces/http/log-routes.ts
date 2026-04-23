import type { FastifyInstance } from "fastify";

import { DeploymentLogService } from "../../application/deployment-log-service.js";
import type { DeploymentLogRepository } from "../../domain/deployment-log-repository.js";
import type { LogPublisher } from "../../domain/log-publisher.js";

interface LogRouteDependencies {
  logRepository: DeploymentLogRepository;
  logPublisher: LogPublisher;
}

export function registerLogRoutes(
  server: FastifyInstance,
  dependencies: LogRouteDependencies,
) {
  const logService = new DeploymentLogService(
    dependencies.logRepository,
    dependencies.logPublisher,
  );

  server.get<{ Params: { deploymentId: string } }>(
    "/api/deployments/:deploymentId/logs",
    async (request) => ({
      logs: logService.listLogs(request.params.deploymentId),
    }),
  );

  server.get<{ Params: { deploymentId: string } }>(
    "/api/deployments/:deploymentId/logs/stream",
    async (request, reply) => {
      const deploymentId = request.params.deploymentId;

      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.flushHeaders();

      for (const log of logService.listLogs(deploymentId)) {
        reply.raw.write(formatSseEvent("log", log));
      }

      const subscription = dependencies.logPublisher.subscribe(
        deploymentId,
        (event) => {
          if (event.type === "log") {
            reply.raw.write(formatSseEvent("log", event.log));
            return;
          }

          reply.raw.write(formatSseEvent("status", event.deployment));
        },
      );

      const heartbeat = setInterval(() => {
        reply.raw.write(": keep-alive\n\n");
      }, 15000);

      request.raw.on("close", () => {
        clearInterval(heartbeat);
        subscription.unsubscribe();
      });

      return reply;
    },
  );
}

function formatSseEvent(event: string, payload: object) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

