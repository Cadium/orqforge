import type { DeploymentLogEvent, DeploymentStatusEvent } from "@orqforge/shared";

export interface LogSubscription {
  unsubscribe(): void;
}

export interface LogPublisher {
  publishLog(event: DeploymentLogEvent): void;
  publishStatus(event: DeploymentStatusEvent): void;
  subscribe(
    deploymentId: string,
    listener: (event: DeploymentLogEvent | DeploymentStatusEvent) => void,
  ): LogSubscription;
}

