import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CaddyIngressManager } from "./caddy-ingress-manager.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("caddy ingress manager", () => {
  it("writes a deployment route snippet and returns the live route path", async () => {
    const root = createTempDirectory();
    const routesDirectory = join(root, "routes");

    const manager = new CaddyIngressManager({
      routesDirectory,
    });

    const result = await manager.provision(
      {
        id: "dep-1",
        slug: "sample-dep-1",
        sourceKind: "sample",
        sourceRef: "hello-node",
        status: "deploying",
        stage: "configuring_ingress",
        imageTag: "orqforge/sample-dep-1:dep-1",
        routePath: null,
        runtimeContainerName: "orqforge-sample-dep-1",
        failureReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        containerName: "orqforge-sample-dep-1",
        upstreamHost: "orqforge-sample-dep-1",
        upstreamPort: 3000,
      },
    );

    const routeFile = readFileSync(join(routesDirectory, "sample-dep-1.caddy"), "utf8");

    expect(result.routePath).toBe("/apps/sample-dep-1");
    expect(routeFile).toContain("handle_path /apps/sample-dep-1/*");
    expect(routeFile).toContain("reverse_proxy orqforge-sample-dep-1:3000");
  });
});

function createTempDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "orqforge-ingress-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

