import { deriveStatusFromStage, transitionStage } from "./deployment-state-machine.js";
import { DeploymentLogService } from "./deployment-log-service.js";
import type { Deployment } from "@orqforge/shared";
import type { ImageBuilder } from "../domain/image-builder.js";
import type { DeploymentRepository } from "../domain/deployment-repository.js";
import type { LogPublisher } from "../domain/log-publisher.js";
import type { SourceMaterializer } from "../domain/source-materializer.js";

export class DeploymentExecutor {
  constructor(
    private readonly deploymentRepository: DeploymentRepository,
    private readonly logService: DeploymentLogService,
    private readonly logPublisher: LogPublisher,
    private readonly sourceMaterializer: SourceMaterializer,
    private readonly imageBuilder: ImageBuilder,
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
      const materializedSource = await this.materializeSource(deploymentId);
      await this.buildImage(deploymentId, materializedSource);
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
        "Deployment executor completed source preparation and image build successfully.",
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

  private async buildImage(
    deploymentId: string,
    materializedSource: Awaited<ReturnType<SourceMaterializer["materialize"]>>,
  ) {
    const deployment = this.deploymentRepository.findById(deploymentId);

    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} disappeared before image build`);
    }

    const buildingDeployment = this.transitionDeployment(deployment, "building_image");

    this.logService.appendLog({
      deploymentId,
      stage: buildingDeployment.stage,
      stream: "system",
      message: `Workspace prepared at ${materializedSource.workspacePath}`,
      createdAt: new Date().toISOString(),
    });
    this.logService.appendLog({
      deploymentId,
      stage: buildingDeployment.stage,
      stream: "system",
      message: "Starting Railpack image build",
      createdAt: new Date().toISOString(),
    });

    const buildResult = await this.imageBuilder.build(
      buildingDeployment,
      materializedSource,
      (event) => {
        this.logService.appendLog({
          deploymentId,
          stage: buildingDeployment.stage,
          stream: event.stream,
          message: event.message,
          createdAt: new Date().toISOString(),
        });
      },
    );

    const updatedDeployment = {
      ...buildingDeployment,
      imageTag: buildResult.imageTag,
      updatedAt: new Date().toISOString(),
    };

    this.deploymentRepository.update(updatedDeployment);
    this.logPublisher.publishStatus({
      type: "status",
      deployment: updatedDeployment,
    });
    this.logService.appendLog({
      deploymentId,
      stage: updatedDeployment.stage,
      stream: "system",
      message: `Built image tag ${buildResult.imageTag}`,
      createdAt: updatedDeployment.updatedAt,
    });
  }

  private async materializeSource(deploymentId: string) {
    const deployment = this.deploymentRepository.findById(deploymentId);

    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} disappeared before materialization`);
    }

    const updatedDeployment = this.transitionDeployment(deployment, "materializing_source");

    this.logService.appendLog({
      deploymentId,
      stage: updatedDeployment.stage,
      stream: "system",
      message: `Preparing ${updatedDeployment.sourceKind} source input`,
      createdAt: new Date().toISOString(),
    });
    this.logService.appendLog({
      deploymentId,
      stage: updatedDeployment.stage,
      stream: "system",
      message: `Source reference: ${updatedDeployment.sourceRef}`,
      createdAt: new Date().toISOString(),
    });

    const materializedSource = await this.sourceMaterializer.materialize(updatedDeployment);

    this.logService.appendLog({
      deploymentId,
      stage: updatedDeployment.stage,
      stream: "system",
      message: materializedSource.description,
      createdAt: new Date().toISOString(),
    });

    return materializedSource;
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

    const updatedDeployment = this.transitionDeployment(deployment, nextStage);

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

  private transitionDeployment(
    deployment: Deployment,
    nextStage:
      | "materializing_source"
      | "building_image"
      | "starting_container"
      | "configuring_ingress"
      | "verifying_route"
      | "completed",
  ) {
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

    return updatedDeployment;
  }
}
