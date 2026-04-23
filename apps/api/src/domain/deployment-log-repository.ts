import type { DeploymentLogEntry } from "@orqforge/shared";

export interface DeploymentLogRepository {
  append(log: Omit<DeploymentLogEntry, "seq">): DeploymentLogEntry;
  listByDeploymentId(deploymentId: string): DeploymentLogEntry[];
}

