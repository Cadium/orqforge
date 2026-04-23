import { randomUUID } from "node:crypto";

import {
  type CreateDeploymentInput,
  type Deployment,
  type DeploymentSourceKind,
} from "@orqforge/shared";

import type { DeploymentRepository } from "../domain/deployment-repository.js";

export class DeploymentService {
  constructor(private readonly deploymentRepository: DeploymentRepository) {}

  createDeployment(input: CreateDeploymentInput): Deployment {
    const now = new Date().toISOString();
    const id = randomUUID();
    const slug = buildDeploymentSlug(input.sourceKind, id);

    const deployment: Deployment = {
      id,
      slug,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      status: "pending",
      stage: "accepted",
      imageTag: null,
      routePath: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };

    this.deploymentRepository.create(deployment);

    return deployment;
  }

  listDeployments() {
    return this.deploymentRepository.list();
  }

  getDeploymentById(id: string) {
    return this.deploymentRepository.findById(id);
  }
}

function buildDeploymentSlug(sourceKind: DeploymentSourceKind, id: string) {
  return `${sourceKind}-${id.slice(0, 8)}`;
}

