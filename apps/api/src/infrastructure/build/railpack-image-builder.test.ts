import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RailpackImageBuilder } from "./railpack-image-builder.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("railpack image builder", () => {
  it("streams stdout and stderr lines and returns the built image tag", async () => {
    const root = createTempDirectory();
    const scriptPath = join(root, "fake-build.mjs");

    writeFileSync(
      scriptPath,
      [
        "console.log('build started');",
        "console.error('warning from stderr');",
        "console.log('build completed');",
      ].join("\n"),
    );

    const logs: string[] = [];
    const builder = new RailpackImageBuilder({
      buildCommandFactory: (_deployment, _source, imageTag) => ({
        command: "node",
        args: [scriptPath, imageTag],
      }),
    });

    const result = await builder.build(
      {
        id: "dep-1",
        slug: "sample-dep-1",
        sourceKind: "sample",
        sourceRef: "hello-node",
        status: "building",
        stage: "building_image",
        imageTag: null,
        routePath: null,
        runtimeContainerName: null,
        failureReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        workspacePath: root,
        description: "prepared workspace",
      },
      (event) => {
        logs.push(`${event.stream}:${event.message}`);
      },
    );

    expect(result.imageTag).toBe("orqforge/sample-dep-1:dep-1");
    expect(logs.some((line) => line.includes("build started"))).toBe(true);
    expect(logs.some((line) => line.includes("warning from stderr"))).toBe(true);
    expect(logs.some((line) => line.includes("build completed"))).toBe(true);
  });

  it("fails when the build command exits unsuccessfully", async () => {
    const root = createTempDirectory();
    const scriptPath = join(root, "failing-build.mjs");

    writeFileSync(scriptPath, "process.exit(7);\n");

    const builder = new RailpackImageBuilder({
      buildCommandFactory: () => ({
        command: "node",
        args: [scriptPath],
      }),
    });

    await expect(
      builder.build(
        {
          id: "dep-2",
          slug: "sample-dep-2",
          sourceKind: "sample",
          sourceRef: "hello-node",
          status: "building",
          stage: "building_image",
          imageTag: null,
          routePath: null,
          runtimeContainerName: null,
          failureReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          workspacePath: root,
          description: "prepared workspace",
        },
        () => {},
      ),
    ).rejects.toThrow(/exited with code 7/i);
  });
});

function createTempDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "orqforge-build-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
