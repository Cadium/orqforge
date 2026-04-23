import type { FastifyInstance } from "fastify";

import {
  DEPLOYMENT_SOURCE_KINDS,
  type CreateDeploymentInput,
} from "@orqforge/shared";

import type { DeploymentExecutor } from "../../application/deployment-executor.js";
import { DeploymentService } from "../../application/deployment-service.js";
import type { DeploymentRepository } from "../../domain/deployment-repository.js";
import { ValidationError } from "../../domain/errors.js";

interface DeploymentRouteDependencies {
  deploymentRepository: DeploymentRepository;
  deploymentExecutor?: DeploymentExecutor;
}

export function registerDeploymentRoutes(
  server: FastifyInstance,
  dependencies: DeploymentRouteDependencies,
) {
  const deploymentService = new DeploymentService(
    dependencies.deploymentRepository,
    dependencies.deploymentExecutor,
  );

  server.get("/api/deployments", async () => ({
    deployments: deploymentService.listDeployments(),
  }));

  server.get<{ Params: { deploymentId: string } }>(
    "/api/deployments/:deploymentId",
    async (request, reply) => {
      const deployment = deploymentService.getDeploymentById(request.params.deploymentId);

      if (!deployment) {
        return reply.code(404).send({
          message: `Deployment ${request.params.deploymentId} was not found`,
        });
      }

      return { deployment };
    },
  );

  server.post<{ Body: unknown }>("/api/deployments", async (request, reply) => {
    const input = parseCreateDeploymentInput(request.body);
    const deployment = deploymentService.createDeployment(input);

    return reply.code(201).send({ deployment });
  });
}

function parseCreateDeploymentInput(body: unknown): CreateDeploymentInput {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Deployment payload must be an object");
  }

  const sourceKind = getStringField(body, "sourceKind");
  const sourceRef = getStringField(body, "sourceRef");

  if (!DEPLOYMENT_SOURCE_KINDS.includes(sourceKind as CreateDeploymentInput["sourceKind"])) {
    throw new ValidationError(
      `sourceKind must be one of: ${DEPLOYMENT_SOURCE_KINDS.join(", ")}`,
    );
  }

  return {
    sourceKind: sourceKind as CreateDeploymentInput["sourceKind"],
    sourceRef,
  };
}

function getStringField(body: object, fieldName: "sourceKind" | "sourceRef") {
  const value = Reflect.get(body, fieldName);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}
