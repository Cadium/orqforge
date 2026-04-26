import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ContainerRuntime } from "../../domain/container-runtime.js";
import type { IngressManager } from "../../domain/ingress-manager.js";
import { createDatabase } from "../../infrastructure/sqlite/database.js";
import { InMemoryLogPublisher } from "../../infrastructure/logging/in-memory-log-publisher.js";
import { SqliteDeploymentLogRepository } from "../../infrastructure/sqlite/sqlite-deployment-log-repository.js";
import { SqliteDeploymentRepository } from "../../infrastructure/sqlite/sqlite-deployment-repository.js";
import { buildServer } from "../../server.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("deployment routes", () => {
  it("creates and lists deployments", async () => {
    const { server } = createTestServer();

    const createResponse = await server.inject({
      method: "POST",
      url: "/api/deployments",
      payload: {
        appName: "orqforge-web",
        sourceKind: "git",
        sourceRef: "https://github.com/Cadium/orqforge.git",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createPayload = createResponse.json();
    expect(createPayload.deployment.status).toBe("pending");
    expect(createPayload.deployment.stage).toBe("accepted");
    expect(createPayload.deployment.appName).toBe("orqforge-web");
    expect(createPayload.deployment.slug).toMatch(/^orqforge-web-/);

    const listResponse = await server.inject({
      method: "GET",
      url: "/api/deployments",
    });

    expect(listResponse.statusCode).toBe(200);
    const listPayload = listResponse.json();
    expect(listPayload.deployments).toHaveLength(1);
    expect(listPayload.deployments[0].sourceRef).toBe(
      "https://github.com/Cadium/orqforge.git",
    );

    await server.close();
  });

  it("returns 404 for an unknown deployment", async () => {
    const { server } = createTestServer();

    const response = await server.inject({
      method: "GET",
      url: "/api/deployments/does-not-exist",
    });

    expect(response.statusCode).toBe(404);

    await server.close();
  });

  it("rejects invalid create payloads", async () => {
    const { server } = createTestServer();

    const response = await server.inject({
      method: "POST",
      url: "/api/deployments",
      payload: {
        appName: "",
        sourceKind: "unknown",
        sourceRef: "",
      },
    });

    expect(response.statusCode).toBe(400);

    await server.close();
  });

  it("stops a running deployment and clears runtime routing metadata", async () => {
    const stoppedContainers: string[] = [];
    const removedRoutes: string[] = [];
    const { server, deploymentRepository } = createTestServer({
      containerRuntime: {
        async start() {
          throw new Error("not used");
        },
        async stop(containerName, onLog) {
          stoppedContainers.push(containerName);
          onLog({ stream: "stdout", message: `removed ${containerName}` });
        },
      },
      ingressManager: {
        async provision() {
          throw new Error("not used");
        },
        async remove(deployment) {
          removedRoutes.push(deployment.slug);
        },
      },
    });

    const createResponse = await server.inject({
      method: "POST",
      url: "/api/deployments",
      payload: {
        appName: "sample-app",
        sourceKind: "sample",
        sourceRef: "hello-node",
      },
    });

    const createdDeployment = createResponse.json().deployment;
    deploymentRepository.update({
      ...createdDeployment,
      status: "running",
      stage: "completed",
      routePath: `/apps/${createdDeployment.slug}`,
      runtimeContainerName: `orqforge-${createdDeployment.slug}`,
    });

    const response = await server.inject({
      method: "POST",
      url: `/api/deployments/${createdDeployment.id}/stop`,
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.deployment.status).toBe("stopped");
    expect(payload.deployment.stage).toBe("stopped");
    expect(payload.deployment.routePath).toBeNull();
    expect(payload.deployment.runtimeContainerName).toBeNull();
    expect(stoppedContainers).toEqual([`orqforge-${createdDeployment.slug}`]);
    expect(removedRoutes).toEqual([createdDeployment.slug]);

    await server.close();
  });
});

function createTestServer(overrides: {
  containerRuntime?: ContainerRuntime;
  ingressManager?: IngressManager;
} = {}) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "orqforge-api-test-"));
  temporaryDirectories.push(temporaryDirectory);

  const database = createDatabase(join(temporaryDirectory, "orqforge.sqlite"));
  const deploymentRepository = new SqliteDeploymentRepository(database);
  const logRepository = new SqliteDeploymentLogRepository(database);
  const logPublisher = new InMemoryLogPublisher();

  const server = buildServer({
      deploymentRepository,
      logRepository,
      logPublisher,
      deploymentExecutor: null,
      containerRuntime: overrides.containerRuntime,
      ingressManager: overrides.ingressManager,
    });

  return {
    server,
    deploymentRepository,
  };
}
