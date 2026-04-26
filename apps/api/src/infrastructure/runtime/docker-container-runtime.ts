import { spawn } from "node:child_process";

import type { Deployment } from "@orqforge/shared";

import type {
  ContainerRuntime,
  RuntimeLogEvent,
  StartedContainer,
} from "../../domain/container-runtime.js";

interface DockerCommand {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

interface DockerContainerRuntimeOptions {
  commandFactory?: (
    deployment: Deployment,
    containerName: string,
  ) => DockerCommand;
  containerNameFactory?: (deployment: Deployment) => string;
  upstreamPort?: number;
  stopCommandFactory?: (containerName: string) => DockerCommand;
}

export class DockerContainerRuntime implements ContainerRuntime {
  private readonly commandFactory: (
    deployment: Deployment,
    containerName: string,
  ) => DockerCommand;

  private readonly containerNameFactory: (deployment: Deployment) => string;
  private readonly upstreamPort: number;
  private readonly stopCommandFactory: (containerName: string) => DockerCommand;

  constructor(options: DockerContainerRuntimeOptions = {}) {
    this.commandFactory = options.commandFactory ?? defaultDockerCommandFactory;
    this.containerNameFactory =
      options.containerNameFactory ?? defaultContainerNameFactory;
    this.upstreamPort = options.upstreamPort ?? 3000;
    this.stopCommandFactory = options.stopCommandFactory ?? defaultStopCommandFactory;
  }

  async start(
    deployment: Deployment,
    onLog: (event: RuntimeLogEvent) => void,
  ): Promise<StartedContainer> {
    if (!deployment.imageTag) {
      throw new Error("Cannot start runtime without a built image tag");
    }

    const containerName = this.containerNameFactory(deployment);
    const command = this.commandFactory(deployment, containerName);

    onLog({
      stream: "stdout",
      message: `Running container command: ${command.command} ${command.args.join(" ")}`,
    });

    await runCommand(command, onLog);

    return {
      containerName,
      upstreamHost: containerName,
      upstreamPort: this.upstreamPort,
    };
  }

  async stop(
    containerName: string,
    onLog: (event: RuntimeLogEvent) => void,
  ): Promise<void> {
    const command = this.stopCommandFactory(containerName);

    onLog({
      stream: "stdout",
      message: `Running stop command: ${command.command} ${command.args.join(" ")}`,
    });

    await runCommand(command, onLog);
  }
}

function defaultContainerNameFactory(deployment: Deployment) {
  return `orqforge-${deployment.slug}-${deployment.id.slice(0, 8)}`;
}

function defaultDockerCommandFactory(
  deployment: Deployment,
  containerName: string,
): DockerCommand {
  return {
    command: process.env.DOCKER_BIN ?? "docker",
    args: [
      "run",
      "-d",
      "--name",
      containerName,
      "--network",
      process.env.ORQFORGE_DOCKER_NETWORK ?? "orqforge",
      "-e",
      "PORT=3000",
      deployment.imageTag ?? "",
    ],
    env: process.env,
  };
}

function defaultStopCommandFactory(containerName: string): DockerCommand {
  return {
    command: process.env.DOCKER_BIN ?? "docker",
    args: ["rm", "-f", containerName],
    env: process.env,
  };
}

async function runCommand(
  command: DockerCommand,
  onLog: (event: RuntimeLogEvent) => void,
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

    child.on("error", (error) => reject(error));
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

      reject(new Error(`Container command exited with code ${code ?? "unknown"}`));
    });
  });
}

function emitLines(
  buffer: string,
  stream: "stdout" | "stderr",
  onLog: (event: RuntimeLogEvent) => void,
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
