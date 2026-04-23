import type { Deployment } from "@orqforge/shared";

export interface DeploymentRepository {
  create(deployment: Deployment): void;
  list(): Deployment[];
  findById(id: string): Deployment | null;
  update(deployment: Deployment): void;
}

