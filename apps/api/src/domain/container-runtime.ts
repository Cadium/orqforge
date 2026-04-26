import type { Deployment } from "@orqforge/shared";

export interface RuntimeLogEvent {
  stream: "stdout" | "stderr";
  message: string;
}

export interface StartedContainer {
  containerName: string;
  upstreamHost: string;
  upstreamPort: number;
}

export interface ContainerRuntime {
  start(
    deployment: Deployment,
    onLog: (event: RuntimeLogEvent) => void,
  ): Promise<StartedContainer>;

  stop(
    containerName: string,
    onLog: (event: RuntimeLogEvent) => void,
  ): Promise<void>;
}
