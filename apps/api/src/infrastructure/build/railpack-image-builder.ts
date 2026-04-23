import { spawn } from "node:child_process";

import type { Deployment } from "@orqforge/shared";

import type {
  BuildLogEvent,
  ImageBuildResult,
  ImageBuilder,
} from "../../domain/image-builder.js";
import type { MaterializedSource } from "../../domain/source-materializer.js";

interface RailpackCommand {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

interface RailpackImageBuilderOptions {
  buildCommandFactory?: (
    deployment: Deployment,
    source: MaterializedSource,
    imageTag: string,
  ) => RailpackCommand;
  imageTagFactory?: (deployment: Deployment) => string;
}

export class RailpackImageBuilder implements ImageBuilder {
  private readonly buildCommandFactory: (
    deployment: Deployment,
    source: MaterializedSource,
    imageTag: string,
  ) => RailpackCommand;

  private readonly imageTagFactory: (deployment: Deployment) => string;

  constructor(options: RailpackImageBuilderOptions = {}) {
    this.buildCommandFactory =
      options.buildCommandFactory ?? defaultBuildCommandFactory;
    this.imageTagFactory = options.imageTagFactory ?? defaultImageTagFactory;
  }

  async build(
    deployment: Deployment,
    source: MaterializedSource,
    onLog: (event: BuildLogEvent) => void,
  ): Promise<ImageBuildResult> {
    const imageTag = this.imageTagFactory(deployment);
    const command = this.buildCommandFactory(deployment, source, imageTag);

    onLog({
      stream: "stdout",
      message: `Running build command: ${command.command} ${command.args.join(" ")}`,
    });

    await runCommand(command, onLog);

    return { imageTag };
  }
}

function defaultImageTagFactory(deployment: Deployment) {
  return `orqforge/${deployment.slug}:${deployment.id.slice(0, 12)}`;
}

function defaultBuildCommandFactory(
  _deployment: Deployment,
  source: MaterializedSource,
  imageTag: string,
): RailpackCommand {
  return {
    command: process.env.RAILPACK_BIN ?? "railpack",
    args: [
      "build",
      "--name",
      imageTag,
      "--progress",
      "plain",
      source.workspacePath,
    ],
    env: process.env,
  };
}

async function runCommand(
  command: RailpackCommand,
  onLog: (event: BuildLogEvent) => void,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      env: command.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    let stdoutBuffer = "";
    let stderrBuffer = "";

    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer = emitLines(stdoutBuffer + chunk, "stdout", onLog);
    });

    child.stderr.on("data", (chunk: string) => {
      stderrBuffer = emitLines(stderrBuffer + chunk, "stderr", onLog);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (stdoutBuffer.length > 0) {
        onLog({ stream: "stdout", message: stdoutBuffer });
      }

      if (stderrBuffer.length > 0) {
        onLog({ stream: "stderr", message: stderrBuffer });
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Build command exited with code ${code ?? "unknown"}`));
    });
  });
}

function emitLines(
  buffer: string,
  stream: "stdout" | "stderr",
  onLog: (event: BuildLogEvent) => void,
) {
  const lines = buffer.split(/\r?\n/);
  const remainder = lines.pop() ?? "";

  for (const line of lines) {
    if (line.length > 0) {
      onLog({ stream, message: line });
    }
  }

  return remainder;
}

