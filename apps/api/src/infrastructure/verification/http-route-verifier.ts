import type { RouteVerifier } from "../../domain/route-verifier.js";

interface HttpRouteVerifierOptions {
  baseUrl?: string;
}

export class HttpRouteVerifier implements RouteVerifier {
  private readonly baseUrl: string;

  constructor(options: HttpRouteVerifierOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://caddy";
  }

  async verify(routePath: string) {
    const response = await fetch(`${this.baseUrl}${routePath}`);

    if (!response.ok) {
      throw new Error(`Route verification failed with status ${response.status}`);
    }
  }
}

