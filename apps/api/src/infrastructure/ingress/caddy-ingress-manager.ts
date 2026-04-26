import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  adminUrl?: string;
  caddyfilePath?: string;
}

export class CaddyIngressManager implements IngressManager {
  private readonly routesDirectory: string;
  private readonly basePath: string;
  private readonly adminUrl: string | null;
  private readonly caddyfilePath: string | null;

  constructor(options: CaddyIngressManagerOptions) {
    this.routesDirectory = resolve(options.routesDirectory);
    this.basePath = options.basePath ?? "/apps";
    this.adminUrl = options.adminUrl ?? null;
    this.caddyfilePath = options.caddyfilePath ?? null;
  }

  async provision(
    deployment: Deployment,
    container: StartedContainer,
  ): Promise<ProvisionedRoute> {
    mkdirSync(this.routesDirectory, { recursive: true });

    const routePath = `${this.basePath}/${deployment.slug}`;
    const routeFilePath = join(this.routesDirectory, `${deployment.slug}.caddy`);

    writeFileSync(routeFilePath, buildRouteSnippet(routePath, container), "utf8");

    await this.reloadCaddy();

    return { routePath };
  }

  private async reloadCaddy() {
    if (!this.adminUrl || !this.caddyfilePath) return;

    try {
      const caddyfile = readFileSync(this.caddyfilePath, "utf8");
      const response = await fetch(`${this.adminUrl}/load`, {
        method: "POST",
        headers: { "Content-Type": "text/caddyfile" },
        body: caddyfile,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.warn(`[caddy-ingress] Admin reload returned ${response.status}: ${text}`);
      }
    } catch (err) {
      // Non-fatal: --watch on the Caddyfile serves as a fallback
      console.warn(
        `[caddy-ingress] Admin reload failed (will rely on --watch): ${String(err)}`,
      );
    }
  }
}

function buildRouteSnippet(routePath: string, container: StartedContainer) {
  return [
    `redir ${routePath} ${routePath}/ 308`,
    `handle_path ${routePath}/* {`,
    `  reverse_proxy ${container.upstreamHost}:${container.upstreamPort}`,
    `}`,
    "",
  ].join("\n");
}
