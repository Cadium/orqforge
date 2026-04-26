import { randomUUID } from "node:crypto";

import {
  type CreateDeploymentInput,
  type Deployment,
  type DeploymentSourceKind,
} from "@orqforge/shared";

import type { DeploymentRepository } from "../domain/deployment-repository.js";
import type { DeploymentExecutor } from "./deployment-executor.js";

export class DeploymentService {
  constructor(
    private readonly deploymentRepository: DeploymentRepository,
    private readonly deploymentExecutor?: DeploymentExecutor,
  ) {}

  createDeployment(input: CreateDeploymentInput): Deployment {
    const now = new Date().toISOString();
    const id = randomUUID();
    const appName = normalizeAppName(input.appName, input.sourceKind, input.sourceRef);
    const slug = buildDeploymentSlug(appName, id);

    const deployment: Deployment = {
      id,
      appName,
      slug,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      status: "pending",
      stage: "accepted",
      imageTag: null,
      routePath: null,
      runtimeContainerName: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };

    this.deploymentRepository.create(deployment);
    this.deploymentExecutor?.enqueue(deployment.id);

    return deployment;
  }

  listDeployments() {
    return this.deploymentRepository.list();
  }

  getDeploymentById(id: string) {
    return this.deploymentRepository.findById(id);
  }
}

function buildDeploymentSlug(appName: string, id: string) {
  return `${slugify(appName)}-${id.slice(0, 8)}`;
}

function normalizeAppName(
  appName: string | undefined,
  sourceKind: DeploymentSourceKind,
  sourceRef: string,
) {
  if (appName?.trim()) {
    return appName.trim();
  }

  if (sourceKind === "sample") {
    return sourceRef;
  }

  if (sourceKind === "git") {
    const repo = sourceRef
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.git$/i, "");

    return repo && repo.length > 0 ? repo : "git-app";
  }

  const fileName = sourceRef.split("/").filter(Boolean).at(-1) ?? "archive-app";
  return fileName.replace(/\.(zip|tar|tgz|tar\.gz)$/i, "") || "archive-app";
}

function slugify(value: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "app";
}
