import type { Deployment } from "@orqforge/shared";

import type { StartedContainer } from "./container-runtime.js";

export interface ProvisionedRoute {
  routePath: string;
}

export interface IngressManager {
  provision(
    deployment: Deployment,
    container: StartedContainer,
  ): Promise<ProvisionedRoute>;
}

