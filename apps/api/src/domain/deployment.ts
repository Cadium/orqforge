import type {
  DeploymentSourceKind,
  DeploymentStage,
  DeploymentStatus,
} from "@orqforge/shared";

export interface Deployment {
  id: string;
  slug: string;
  sourceKind: DeploymentSourceKind;
  status: DeploymentStatus;
  stage: DeploymentStage;
  imageTag: string | null;
  routePath: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

