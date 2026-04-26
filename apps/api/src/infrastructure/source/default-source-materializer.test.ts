import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { DefaultSourceMaterializer } from "./default-source-materializer.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("default source materializer", () => {
  it("copies sample app sources into a deployment workspace", async () => {
    const root = createTempDirectory();
    const sampleAppsRoot = join(root, "sample-apps");
    const workspaceRoot = join(root, "workspaces");
    const samplePath = join(sampleAppsRoot, "hello-node");

    mkdirSync(samplePath, { recursive: true });
    writeFileSync(join(samplePath, "server.js"), "console.log('hello')");

    const materializer = new DefaultSourceMaterializer({
      sampleAppsRoot,
      workspaceRoot,
    });

    const result = await materializer.materialize({
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

    expect(readFileSync(join(result.workspacePath, "server.js"), "utf8")).toContain("hello");
  });

  it("clones a local git repository into a deployment workspace", async () => {
    const root = createTempDirectory();
    const repoPath = join(root, "git-source");
    const workspaceRoot = join(root, "workspaces");

    mkdirSync(repoPath, { recursive: true });
    execFileSync("git", ["init", "-b", "main"], { cwd: repoPath });
    writeFileSync(join(repoPath, "README.md"), "# hello");
    execFileSync("git", ["add", "README.md"], { cwd: repoPath });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Orqforge",
        "-c",
        "user.email=orqforge@example.com",
        "commit",
        "-m",
        "init",
      ],
      { cwd: repoPath },
    );

    const materializer = new DefaultSourceMaterializer({
      sampleAppsRoot: join(root, "sample-apps"),
      workspaceRoot,
    });

    const result = await materializer.materialize({
      id: "dep-2",
      appName: "git-dep-2",
      slug: "git-dep-2",
      sourceKind: "git",
      sourceRef: repoPath,
      status: "pending",
      stage: "accepted",
      imageTag: null,
      routePath: null,
      runtimeContainerName: null,
      failureReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(readFileSync(join(result.workspacePath, "README.md"), "utf8")).toContain("# hello");
  });

  it("extracts a tar archive into a deployment workspace", async () => {
    const root = createTempDirectory();
    const archiveSourcePath = join(root, "archive-source");
    const workspaceRoot = join(root, "workspaces");
    const archivePath = join(root, "hello-node.tar");

    mkdirSync(archiveSourcePath, { recursive: true });
    writeFileSync(join(archiveSourcePath, "index.txt"), "archive hello");
    execFileSync("tar", ["-cf", archivePath, "-C", archiveSourcePath, "."]);

    const materializer = new DefaultSourceMaterializer({
      sampleAppsRoot: join(root, "sample-apps"),
      workspaceRoot,
    });

    const result = await materializer.materialize({
      id: "dep-3",
      appName: "archive-dep-3",
      slug: "archive-dep-3",
      sourceKind: "archive",
      sourceRef: archivePath,
      status: "pending",
      stage: "accepted",
      imageTag: null,
      routePath: null,
      runtimeContainerName: null,
      failureReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(readFileSync(join(result.workspacePath, "index.txt"), "utf8")).toContain(
      "archive hello",
    );
  });
});

function createTempDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "orqforge-source-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
