import type { DeploymentSourceKind } from "./deployments.js";
import type { DeploymentStage, DeploymentStatus } from "./deployments.js";

export interface CreateDeploymentInput {
  sourceKind: DeploymentSourceKind;
  sourceRef: string;
}

export interface Deployment {
  id: string;
  slug: string;
  sourceKind: DeploymentSourceKind;
  sourceRef: string;
  status: DeploymentStatus;
  stage: DeploymentStage;
  imageTag: string | null;
  routePath: string | null;
  runtimeContainerName: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentLogEntry {
  deploymentId: string;
  seq: number;
  stage: DeploymentStage;
  stream: "stdout" | "stderr" | "system";
  message: string;
  createdAt: string;
}

export interface DeploymentLogEvent {
  type: "log";
  log: DeploymentLogEntry;
}

export interface DeploymentStatusEvent {
  type: "status";
  deployment: Deployment;
}
