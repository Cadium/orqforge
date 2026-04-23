import { deriveStatusFromStage, transitionStage } from "./deployment-state-machine.js";
import { DeploymentLogService } from "./deployment-log-service.js";
import type { Deployment } from "@orqforge/shared";
import type { ContainerRuntime } from "../domain/container-runtime.js";
import type { ImageBuilder } from "../domain/image-builder.js";
import type { DeploymentRepository } from "../domain/deployment-repository.js";
import type { IngressManager } from "../domain/ingress-manager.js";
import type { LogPublisher } from "../domain/log-publisher.js";
import type { RouteVerifier } from "../domain/route-verifier.js";
import type { SourceMaterializer } from "../domain/source-materializer.js";

export class DeploymentExecutor {
  constructor(
    private readonly deploymentRepository: DeploymentRepository,
    private readonly logService: DeploymentLogService,
    private readonly logPublisher: LogPublisher,
    private readonly sourceMaterializer: SourceMaterializer,
    private readonly imageBuilder: ImageBuilder,
    private readonly containerRuntime: ContainerRuntime,
    private readonly ingressManager: IngressManager,
    private readonly routeVerifier: RouteVerifier,
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
      await this.startContainer(deploymentId);
      await this.configureIngress(deploymentId);
      await this.verifyRoute(deploymentId);
      await this.advance(deploymentId, "completed", [
        "Deployment executor completed source preparation, image build, runtime startup, and routing successfully.",
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

  private async configureIngress(deploymentId: string) {
    const deployment = this.deploymentRepository.findById(deploymentId);

    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} disappeared before ingress provisioning`);
    }

    if (!deployment.runtimeContainerName) {
      throw new Error("Cannot configure ingress without a running container");
    }

    const runtimeContainerName = deployment.runtimeContainerName;
    const ingressDeployment = this.transitionDeployment(deployment, "configuring_ingress");
    const provisionedRoute = await this.ingressManager.provision(ingressDeployment, {
      containerName: runtimeContainerName,
      upstreamHost: runtimeContainerName,
      upstreamPort: 3000,
    });

    const updatedDeployment = {
      ...ingressDeployment,
      routePath: provisionedRoute.routePath,
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
      message: `Provisioned Caddy route at ${updatedDeployment.routePath}`,
      createdAt: updatedDeployment.updatedAt,
    });
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

  private async startContainer(deploymentId: string) {
    const deployment = this.deploymentRepository.findById(deploymentId);

    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} disappeared before runtime start`);
    }

    const startingDeployment = this.transitionDeployment(deployment, "starting_container");
    const startedContainer = await this.containerRuntime.start(
      startingDeployment,
      (event) => {
        this.logService.appendLog({
          deploymentId,
          stage: startingDeployment.stage,
          stream: event.stream,
          message: event.message,
          createdAt: new Date().toISOString(),
        });
      },
    );

    const updatedDeployment = {
      ...startingDeployment,
      runtimeContainerName: startedContainer.containerName,
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
      message: `Started container ${startedContainer.containerName}`,
      createdAt: updatedDeployment.updatedAt,
    });
  }

  private async verifyRoute(deploymentId: string) {
    const deployment = this.deploymentRepository.findById(deploymentId);

    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} disappeared before route verification`);
    }

    if (!deployment.routePath) {
      throw new Error("Cannot verify a route that has not been provisioned");
    }

    const routePath = deployment.routePath;
    const verifyingDeployment = this.transitionDeployment(deployment, "verifying_route");
    await this.routeVerifier.verify(routePath);

    this.logService.appendLog({
      deploymentId,
      stage: verifyingDeployment.stage,
      stream: "system",
      message: `Verified live route ${routePath}`,
      createdAt: new Date().toISOString(),
    });
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
