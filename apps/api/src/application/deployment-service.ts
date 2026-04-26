import { randomUUID } from "node:crypto";

import {
  type CreateDeploymentInput,
  type Deployment,
  type DeploymentSourceKind,
} from "@orqforge/shared";

import type { ContainerRuntime } from "../domain/container-runtime.js";
import type { DeploymentRepository } from "../domain/deployment-repository.js";
import type { IngressManager } from "../domain/ingress-manager.js";
import type { LogPublisher } from "../domain/log-publisher.js";
import { ValidationError } from "../domain/errors.js";
import type { DeploymentExecutor } from "./deployment-executor.js";
import { DeploymentLogService } from "./deployment-log-service.js";
import { deriveStatusFromStage, transitionStage } from "./deployment-state-machine.js";

export class DeploymentService {
  constructor(
    private readonly deploymentRepository: DeploymentRepository,
    private readonly deploymentExecutor?: DeploymentExecutor,
    private readonly deploymentLogService?: DeploymentLogService,
    private readonly logPublisher?: LogPublisher,
    private readonly containerRuntime?: ContainerRuntime,
    private readonly ingressManager?: IngressManager,
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

  async stopDeployment(id: string) {
    const deployment = this.deploymentRepository.findById(id);

    if (!deployment) {
      return null;
    }

    if (deployment.status !== "running" || deployment.stage !== "completed") {
      throw new ValidationError("Only running deployments can be stopped");
    }

    if (!deployment.runtimeContainerName) {
      throw new ValidationError("Running deployment is missing container metadata");
    }

    if (!this.deploymentLogService || !this.logPublisher || !this.containerRuntime || !this.ingressManager) {
      throw new Error("Stopping a deployment requires runtime, ingress, and log dependencies");
    }

    const log = (stream: "stdout" | "stderr" | "system", message: string, createdAt?: string) =>
      this.deploymentLogService?.appendLog({
        deploymentId: deployment.id,
        stage: deployment.stage,
        stream,
        message,
        createdAt: createdAt ?? new Date().toISOString(),
      });

    log("system", `Stopping deployment ${deployment.slug}`);

    await this.containerRuntime.stop(deployment.runtimeContainerName, (event) => {
      log(event.stream, event.message);
    });

    if (deployment.routePath) {
      await this.ingressManager.remove(deployment);
      log("system", `Removed Caddy route ${deployment.routePath}`);
    }

    const updatedAt = new Date().toISOString();
    const stoppedDeployment: Deployment = {
      ...deployment,
      stage: transitionStage(deployment.stage, "stopped"),
      status: deriveStatusFromStage("stopped"),
      routePath: null,
      runtimeContainerName: null,
      failureReason: null,
      updatedAt,
    };

    this.deploymentRepository.update(stoppedDeployment);
    this.logPublisher.publishStatus({
      type: "status",
      deployment: stoppedDeployment,
    });
    this.deploymentLogService.appendLog({
      deploymentId: deployment.id,
      stage: "stopped",
      stream: "system",
      message: `Deployment ${deployment.slug} has been stopped`,
      createdAt: updatedAt,
    });

    return stoppedDeployment;
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
