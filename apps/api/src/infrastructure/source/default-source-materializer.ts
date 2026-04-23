import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";

import type { Deployment } from "@orqforge/shared";

import type {
  MaterializedSource,
  SourceMaterializer,
} from "../../domain/source-materializer.js";

const execFile = promisify(execFileCallback);

interface DefaultSourceMaterializerOptions {
  sampleAppsRoot: string;
  workspaceRoot: string;
}

export class DefaultSourceMaterializer implements SourceMaterializer {
  private readonly sampleAppsRoot: string;
  private readonly workspaceRoot: string;

  constructor(options: DefaultSourceMaterializerOptions) {
    this.sampleAppsRoot = resolve(options.sampleAppsRoot);
    this.workspaceRoot = resolve(options.workspaceRoot);
  }

  async materialize(deployment: Deployment): Promise<MaterializedSource> {
    const workspacePath = this.prepareWorkspace(deployment.id);

    switch (deployment.sourceKind) {
      case "sample":
        return this.materializeSampleSource(deployment.sourceRef, workspacePath);
      case "git":
        return this.materializeGitSource(deployment.sourceRef, workspacePath);
      case "archive":
        return this.materializeArchiveSource(deployment.sourceRef, workspacePath);
      default:
        throw new Error(`Unsupported Orqforge source kind: ${deployment.sourceKind}`);
    }
  }

  private prepareWorkspace(deploymentId: string) {
    const workspacePath = join(this.workspaceRoot, deploymentId);

    rmSync(workspacePath, { recursive: true, force: true });
    mkdirSync(workspacePath, { recursive: true });

    return workspacePath;
  }

  private async materializeSampleSource(
    sampleName: string,
    workspacePath: string,
  ): Promise<MaterializedSource> {
    const sourcePath = resolve(this.sampleAppsRoot, sampleName);

    if (!existsSync(sourcePath)) {
      throw new Error(`Orqforge sample app '${sampleName}' was not found`);
    }

    cpSync(sourcePath, workspacePath, { recursive: true });

    return {
      workspacePath,
      description: `Copied sample app '${sampleName}' into ${workspacePath}`,
    };
  }

  private async materializeGitSource(
    sourceRef: string,
    workspacePath: string,
  ): Promise<MaterializedSource> {
    await execFile("git", ["clone", "--depth", "1", sourceRef, workspacePath]);

    return {
      workspacePath,
      description: `Cloned Git source '${sourceRef}' into ${workspacePath}`,
    };
  }

  private async materializeArchiveSource(
    sourceRef: string,
    workspacePath: string,
  ): Promise<MaterializedSource> {
    const archivePath = resolve(sourceRef);

    if (!existsSync(archivePath)) {
      throw new Error(`Orqforge archive source '${sourceRef}' was not found`);
    }

    if (archivePath.endsWith(".zip")) {
      await execFile("unzip", ["-q", archivePath, "-d", workspacePath]);
    } else if (isTarArchive(archivePath)) {
      await execFile("tar", ["-xf", archivePath, "-C", workspacePath]);
    } else {
      throw new Error(
        `Unsupported archive format '${basename(archivePath)}'. Use .zip, .tar, .tgz, or .tar.gz`,
      );
    }

    return {
      workspacePath,
      description: `Extracted archive '${archivePath}' into ${workspacePath}`,
    };
  }
}

function isTarArchive(filePath: string) {
  const extension = extname(filePath);
  return (
    extension === ".tar" ||
    extension === ".tgz" ||
    filePath.endsWith(".tar.gz")
  );
}

