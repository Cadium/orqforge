import type { RouteVerifier } from "../../domain/route-verifier.js";

interface HttpRouteVerifierOptions {
  baseUrl?: string;
  maxAttempts?: number;
  initialDelayMs?: number;
}

export class HttpRouteVerifier implements RouteVerifier {
  private readonly baseUrl: string;
  private readonly maxAttempts: number;
  private readonly initialDelayMs: number;

  constructor(options: HttpRouteVerifierOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://caddy";
    this.maxAttempts = options.maxAttempts ?? 12;
    this.initialDelayMs = options.initialDelayMs ?? 1_500;
  }

  async verify(routePath: string) {
    const url = `${this.baseUrl}${routePath}`;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await fetch(url);

        if (response.ok) return;

        lastError = new Error(
          `Route verification failed with status ${response.status}`,
        );
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < this.maxAttempts) {
        const delay = this.initialDelayMs * Math.pow(1.5, attempt - 1);
        await sleep(Math.min(delay, 10_000));
      }
    }

    throw lastError ?? new Error("Route verification failed after all attempts");
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
