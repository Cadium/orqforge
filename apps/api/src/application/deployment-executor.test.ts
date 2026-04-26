import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DeploymentExecutor } from "./deployment-executor.js";
import { DeploymentLogService } from "./deployment-log-service.js";
import type { ContainerRuntime } from "../domain/container-runtime.js";
import type { ImageBuilder } from "../domain/image-builder.js";
import type { IngressManager } from "../domain/ingress-manager.js";
import type { RouteVerifier } from "../domain/route-verifier.js";
import type { SourceMaterializer } from "../domain/source-materializer.js";
import { createDatabase } from "../infrastructure/sqlite/database.js";
import { InMemoryLogPublisher } from "../infrastructure/logging/in-memory-log-publisher.js";
import { SqliteDeploymentLogRepository } from "../infrastructure/sqlite/sqlite-deployment-log-repository.js";
import { SqliteDeploymentRepository } from "../infrastructure/sqlite/sqlite-deployment-repository.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("deployment executor", () => {
  it("advances a deployment through the skeleton stages and persists logs", async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "orqforge-api-test-"));
    temporaryDirectories.push(temporaryDirectory);

    const database = createDatabase(join(temporaryDirectory, "orqforge.sqlite"));
    const deploymentRepository = new SqliteDeploymentRepository(database);
    const logRepository = new SqliteDeploymentLogRepository(database);
    const logPublisher = new InMemoryLogPublisher();
    const logService = new DeploymentLogService(logRepository, logPublisher);
    const sourceMaterializer: SourceMaterializer = {
      async materialize() {
        return {
          workspacePath: join(temporaryDirectory, "workspaces", "dep-1"),
          description: "Prepared sample workspace",
        };
      },
    };
    const imageBuilder: ImageBuilder = {
      async build(_deployment, _source, onLog) {
        onLog({ stream: "stdout", message: "railpack build started" });
        onLog({ stream: "stdout", message: "railpack build completed" });
        return {
          imageTag: "orqforge/sample-dep-1:dep-1",
        };
      },
    };
    const containerRuntime: ContainerRuntime = {
      async start(_deployment, onLog) {
        onLog({ stream: "stdout", message: "container booted" });
        return {
          containerName: "orqforge-sample-dep-1-dep-1",
          upstreamHost: "orqforge-sample-dep-1-dep-1",
          upstreamPort: 3000,
        };
      },
      async stop() {},
    };
    const ingressManager: IngressManager = {
      async provision() {
        return {
          routePath: "/apps/sample-dep-1",
        };
      },
      async remove() {},
    };
    const routeVerifier: RouteVerifier = {
      async verify() {},
    };
    const executor = new DeploymentExecutor(
      deploymentRepository,
      logService,
      logPublisher,
      sourceMaterializer,
      imageBuilder,
      containerRuntime,
      ingressManager,
      routeVerifier,
    );

    deploymentRepository.create({
      id: "dep-1",
      appName: "sample-dep-1",
      slug: "sample-dep-1",
      sourceKind: "sample",
      sourceRef: "hello-node",
      status: "pending",
      stage: "accepted",
      imageTag: null,
      routePath: null,
      runtimeContainerName: null,
      failureReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    executor.enqueue("dep-1");

    await waitFor(async () => {
      const deployment = deploymentRepository.findById("dep-1");
      return deployment?.status === "running";
    });

    const deployment = deploymentRepository.findById("dep-1");
    const logs = logRepository.listByDeploymentId("dep-1");

    expect(deployment?.stage).toBe("completed");
    expect(deployment?.imageTag).toBe("orqforge/sample-dep-1:dep-1");
    expect(deployment?.runtimeContainerName).toBe("orqforge-sample-dep-1-dep-1");
    expect(deployment?.routePath).toBe("/apps/sample-dep-1");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((log) => log.message.includes("Prepared sample workspace"))).toBe(true);
    expect(logs.some((log) => log.message.includes("railpack build completed"))).toBe(true);
    expect(logs.some((log) => log.message.includes("container booted"))).toBe(true);
    expect(logs.some((log) => log.message.includes("Verified live route"))).toBe(true);
    expect(logs.at(-1)?.message).toMatch(/routing successfully/i);
  });

  it("serializes queued deployments instead of running them concurrently", async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "orqforge-api-test-"));
    temporaryDirectories.push(temporaryDirectory);

    const database = createDatabase(join(temporaryDirectory, "orqforge.sqlite"));
    const deploymentRepository = new SqliteDeploymentRepository(database);
    const logRepository = new SqliteDeploymentLogRepository(database);
    const logPublisher = new InMemoryLogPublisher();
    const logService = new DeploymentLogService(logRepository, logPublisher);
    const runOrder: string[] = [];
    let concurrentRuns = 0;
    let maxConcurrentRuns = 0;

    const sourceMaterializer: SourceMaterializer = {
      async materialize(deployment) {
        concurrentRuns += 1;
        maxConcurrentRuns = Math.max(maxConcurrentRuns, concurrentRuns);
        runOrder.push(`start:${deployment.id}`);
        await new Promise((resolve) => setTimeout(resolve, 25));

        return {
          workspacePath: join(temporaryDirectory, "workspaces", deployment.id),
          description: `Prepared workspace for ${deployment.id}`,
        };
      },
    };
    const imageBuilder: ImageBuilder = {
      async build(deployment) {
        return {
          imageTag: `orqforge/${deployment.slug}:${deployment.id}`,
        };
      },
    };
    const containerRuntime: ContainerRuntime = {
      async start(deployment) {
        concurrentRuns -= 1;
        runOrder.push(`finish:${deployment.id}`);

        return {
          containerName: `orqforge-${deployment.slug}`,
          upstreamHost: `orqforge-${deployment.slug}`,
          upstreamPort: 3000,
        };
      },
      async stop() {},
    };
    const ingressManager: IngressManager = {
      async provision(deployment) {
        return {
          routePath: `/apps/${deployment.slug}`,
        };
      },
      async remove() {},
    };
    const routeVerifier: RouteVerifier = {
      async verify() {},
    };
    const executor = new DeploymentExecutor(
      deploymentRepository,
      logService,
      logPublisher,
      sourceMaterializer,
      imageBuilder,
      containerRuntime,
      ingressManager,
      routeVerifier,
    );

    for (const deploymentId of ["dep-a", "dep-b"]) {
      deploymentRepository.create({
        id: deploymentId,
        appName: deploymentId,
        slug: deploymentId,
        sourceKind: "sample",
        sourceRef: "hello-node",
        status: "pending",
        stage: "accepted",
        imageTag: null,
        routePath: null,
        runtimeContainerName: null,
        failureReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    executor.enqueue("dep-a");
    executor.enqueue("dep-b");

    await waitFor(async () => {
      const a = deploymentRepository.findById("dep-a");
      const b = deploymentRepository.findById("dep-b");
      return a?.status === "running" && b?.status === "running";
    }, 2000);

    expect(maxConcurrentRuns).toBe(1);
    expect(runOrder).toEqual(["start:dep-a", "finish:dep-a", "start:dep-b", "finish:dep-b"]);
  });
});

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 1000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for condition");
}
