import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DeploymentLogService } from "../../application/deployment-log-service.js";
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

describe("log routes", () => {
  it("returns persisted deployment logs", async () => {
    const { server, logService } = createTestContext();

    const createResponse = await server.inject({
      method: "POST",
      url: "/api/deployments",
      payload: {
        sourceKind: "sample",
        sourceRef: "hello-node",
      },
    });

    const deploymentId = createResponse.json().deployment.id as string;

    logService.appendLog({
      deploymentId,
      stage: "accepted",
      stream: "system",
      message: "manual test log",
      createdAt: new Date().toISOString(),
    });

    const response = await server.inject({
      method: "GET",
      url: `/api/deployments/${deploymentId}/logs`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().logs[0].message).toBe("manual test log");

    await server.close();
  });
});

function createTestContext() {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "orqforge-api-test-"));
  temporaryDirectories.push(temporaryDirectory);

  const database = createDatabase(join(temporaryDirectory, "orqforge.sqlite"));
  const deploymentRepository = new SqliteDeploymentRepository(database);
  const logRepository = new SqliteDeploymentLogRepository(database);
  const logPublisher = new InMemoryLogPublisher();
  const logService = new DeploymentLogService(logRepository, logPublisher);

  return {
    logService,
    server: buildServer({
      deploymentRepository,
      logRepository,
      logPublisher,
      deploymentExecutor: null,
    }),
  };
}
