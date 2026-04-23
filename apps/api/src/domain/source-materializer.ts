import type { Deployment } from "@orqforge/shared";

export interface MaterializedSource {
  workspacePath: string;
  description: string;
}

export interface SourceMaterializer {
  materialize(deployment: Deployment): Promise<MaterializedSource>;
}

