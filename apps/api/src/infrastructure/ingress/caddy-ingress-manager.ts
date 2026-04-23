import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Deployment } from "@orqforge/shared";

import type {
  IngressManager,
  ProvisionedRoute,
} from "../../domain/ingress-manager.js";
import type { StartedContainer } from "../../domain/container-runtime.js";

interface CaddyIngressManagerOptions {
  routesDirectory: string;
  basePath?: string;
}

export class CaddyIngressManager implements IngressManager {
  private readonly routesDirectory: string;
  private readonly basePath: string;

  constructor(options: CaddyIngressManagerOptions) {
    this.routesDirectory = resolve(options.routesDirectory);
    this.basePath = options.basePath ?? "/apps";
  }

  async provision(
    deployment: Deployment,
    container: StartedContainer,
  ): Promise<ProvisionedRoute> {
    mkdirSync(this.routesDirectory, { recursive: true });

    const routePath = `${this.basePath}/${deployment.slug}`;
    const routeFilePath = join(this.routesDirectory, `${deployment.slug}.caddy`);
    const contents = buildRouteFile(routePath, container);

    writeFileSync(routeFilePath, contents, "utf8");

    return { routePath };
  }
}

function buildRouteFile(routePath: string, container: StartedContainer) {
  return [
    `redir ${routePath} ${routePath}/ 308`,
    `handle_path ${routePath}/* {`,
    `  reverse_proxy ${container.upstreamHost}:${container.upstreamPort}`,
    `}`,
    "",
  ].join("\n");
}

