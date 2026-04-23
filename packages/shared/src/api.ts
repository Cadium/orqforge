import type { DeploymentSourceKind } from "./deployments.js";

export interface CreateDeploymentInput {
  sourceKind: DeploymentSourceKind;
  sourceRef: string;
}

export interface Deployment {
  id: string;
  slug: string;
  sourceKind: DeploymentSourceKind;
  sourceRef: string;
  status: import("./deployments.js").DeploymentStatus;
  stage: import("./deployments.js").DeploymentStage;
  imageTag: string | null;
  routePath: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

