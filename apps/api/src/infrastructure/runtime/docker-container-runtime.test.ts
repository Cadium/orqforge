import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DockerContainerRuntime } from "./docker-container-runtime.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("docker container runtime", () => {
  it("streams runtime output and returns container routing metadata", async () => {
    const root = createTempDirectory();
    const scriptPath = join(root, "fake-run.mjs");

    writeFileSync(
      scriptPath,
      [
        "console.log('container started');",
        "console.error('runtime warning');",
      ].join("\n"),
    );

    const logs: string[] = [];
    const runtime = new DockerContainerRuntime({
      commandFactory: (_deployment, containerName) => ({
        command: "node",
        args: [scriptPath, containerName],
      }),
    });

    const result = await runtime.start(
      {
        id: "dep-1",
        appName: "sample-dep-1",
        slug: "sample-dep-1",
        sourceKind: "sample",
        sourceRef: "hello-node",
        status: "deploying",
        stage: "starting_container",
        imageTag: "orqforge/sample-dep-1:dep-1",
        routePath: null,
        runtimeContainerName: null,
        failureReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      (event) => logs.push(`${event.stream}:${event.message}`),
    );

    expect(result.containerName).toContain("orqforge-sample-dep-1");
    expect(result.upstreamHost).toBe(result.containerName);
    expect(result.upstreamPort).toBe(3000);
    expect(logs.some((line) => line.includes("container started"))).toBe(true);
    expect(logs.some((line) => line.includes("runtime warning"))).toBe(true);
  });
});

function createTempDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "orqforge-runtime-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
