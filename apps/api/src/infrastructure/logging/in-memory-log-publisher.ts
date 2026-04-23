import type { DeploymentLogEvent, DeploymentStatusEvent } from "@orqforge/shared";

import type {
  LogPublisher,
  LogSubscription,
} from "../../domain/log-publisher.js";

type DeploymentEvent = DeploymentLogEvent | DeploymentStatusEvent;
type Listener = (event: DeploymentEvent) => void;

export class InMemoryLogPublisher implements LogPublisher {
  private readonly listeners = new Map<string, Set<Listener>>();

  publishLog(event: DeploymentLogEvent) {
    this.emit(event.log.deploymentId, event);
  }

  publishStatus(event: DeploymentStatusEvent) {
    this.emit(event.deployment.id, event);
  }

  subscribe(deploymentId: string, listener: Listener): LogSubscription {
    const listeners = this.listeners.get(deploymentId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(deploymentId, listeners);

    return {
      unsubscribe: () => {
        const currentListeners = this.listeners.get(deploymentId);
        if (!currentListeners) {
          return;
        }

        currentListeners.delete(listener);

        if (currentListeners.size === 0) {
          this.listeners.delete(deploymentId);
        }
      },
    };
  }

  private emit(deploymentId: string, event: DeploymentEvent) {
    const listeners = this.listeners.get(deploymentId);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }
}

