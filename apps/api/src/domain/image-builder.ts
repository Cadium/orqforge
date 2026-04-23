import type { Deployment } from "@orqforge/shared";

import type { MaterializedSource } from "./source-materializer.js";

export interface BuildLogEvent {
  stream: "stdout" | "stderr";
  message: string;
}

export interface ImageBuildResult {
  imageTag: string;
}

export interface ImageBuilder {
  build(
    deployment: Deployment,
    source: MaterializedSource,
    onLog: (event: BuildLogEvent) => void,
  ): Promise<ImageBuildResult>;
}

