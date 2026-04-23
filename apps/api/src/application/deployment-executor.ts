import { deriveStatusFromStage, transitionStage } from "./deployment-state-machine.js";
import { DeploymentLogService } from "./deployment-log-service.js";
import type { DeploymentRepository } from "../domain/deployment-repository.js";
import type { LogPublisher } from "../domain/log-publisher.js";

export class DeploymentExecutor {
  constructor(
    private readonly deploymentRepository: DeploymentRepository,
    private readonly logService: DeploymentLogService,
    private readonly logPublisher: LogPublisher,
  ) {}

  enqueue(deploymentId: string) {
    void this.run(deploymentId);
  }

  private async run(deploymentId: string) {
    const deployment = this.deploymentRepository.findById(deploymentId);

    if (!deployment) {
      return;
    }

    try {
      await this.advance(deploymentId, "materializing_source", [
        `Preparing ${deployment.sourceKind} source input`,
        `Source reference: ${deployment.sourceRef}`,
      ]);
      await this.advance(deploymentId, "building_image", [
        "Build execution is not wired yet; this is the pipeline skeleton stage.",
      ]);
      await this.advance(deploymentId, "starting_container", [
        "Container startup is stubbed until Docker runtime integration lands.",
      ]);
      await this.advance(deploymentId, "configuring_ingress", [
        "Caddy route provisioning will be connected in a subsequent phase.",
      ]);
      await this.advance(deploymentId, "verifying_route", [
        "Route verification placeholder completed.",
      ]);
      await this.advance(deploymentId, "completed", [
        "Deployment executor skeleton completed successfully.",
      ]);
    } catch (error) {
      const latestDeployment = this.deploymentRepository.findById(deploymentId);

      if (!latestDeployment) {
        return;
      }

      const failedDeployment = {
        ...latestDeployment,
        stage: "failed" as const,
        status: "failed" as const,
        failureReason:
          error instanceof Error ? error.message : "Unknown executor failure",
        updatedAt: new Date().toISOString(),
      };

      this.deploymentRepository.update(failedDeployment);
      this.logPublisher.publishStatus({
        type: "status",
        deployment: failedDeployment,
      });
      this.logService.appendLog({
        deploymentId,
        stage: "failed",
        stream: "stderr",
        message: failedDeployment.failureReason ?? "Unknown executor failure",
        createdAt: failedDeployment.updatedAt,
      });
    }
  }

  private async advance(
    deploymentId: string,
    nextStage:
      | "materializing_source"
      | "building_image"
      | "starting_container"
      | "configuring_ingress"
      | "verifying_route"
      | "completed",
    messages: string[],
  ) {
    const deployment = this.deploymentRepository.findById(deploymentId);

    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} disappeared during execution`);
    }

    const updatedAt = new Date().toISOString();
    const updatedDeployment = {
      ...deployment,
      stage: transitionStage(deployment.stage, nextStage),
      status: deriveStatusFromStage(nextStage),
      updatedAt,
    };

    this.deploymentRepository.update(updatedDeployment);
    this.logPublisher.publishStatus({
      type: "status",
      deployment: updatedDeployment,
    });

    for (const message of messages) {
      this.logService.appendLog({
        deploymentId,
        stage: updatedDeployment.stage,
        stream: "system",
        message,
        createdAt: new Date().toISOString(),
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

