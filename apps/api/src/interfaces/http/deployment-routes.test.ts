import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDatabase } from "../../infrastructure/sqlite/database.js";
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
    const server = createTestServer();

    const createResponse = await server.inject({
      method: "POST",
      url: "/api/deployments",
      payload: {
        sourceKind: "git",
        sourceRef: "https://github.com/Cadium/orqforge.git",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createPayload = createResponse.json();
    expect(createPayload.deployment.status).toBe("pending");
    expect(createPayload.deployment.stage).toBe("accepted");

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
    const server = createTestServer();

    const response = await server.inject({
      method: "GET",
      url: "/api/deployments/does-not-exist",
    });

    expect(response.statusCode).toBe(404);

    await server.close();
  });

  it("rejects invalid create payloads", async () => {
    const server = createTestServer();

    const response = await server.inject({
      method: "POST",
      url: "/api/deployments",
      payload: {
        sourceKind: "unknown",
        sourceRef: "",
      },
    });

    expect(response.statusCode).toBe(400);

    await server.close();
  });
});

function createTestServer() {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "orqforge-api-test-"));
  temporaryDirectories.push(temporaryDirectory);

  const database = createDatabase(join(temporaryDirectory, "orqforge.sqlite"));
  const deploymentRepository = new SqliteDeploymentRepository(database);

  return buildServer({
    deploymentRepository,
  });
}

