import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(server: FastifyInstance) {
  server.get("/api/health", async () => ({
    service: "orqforge-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  }));
}
