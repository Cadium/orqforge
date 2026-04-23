import type { DeploymentLogEntry } from "@orqforge/shared";

import type { DeploymentLogRepository } from "../domain/deployment-log-repository.js";
import type { LogPublisher } from "../domain/log-publisher.js";

export class DeploymentLogService {
  constructor(
    private readonly logRepository: DeploymentLogRepository,
    private readonly logPublisher: LogPublisher,
  ) {}

  appendLog(log: Omit<DeploymentLogEntry, "seq">) {
    const persistedLog = this.logRepository.append(log);
    this.logPublisher.publishLog({
      type: "log",
      log: persistedLog,
    });

    return persistedLog;
  }

  listLogs(deploymentId: string) {
    return this.logRepository.listByDeploymentId(deploymentId);
  }
}

