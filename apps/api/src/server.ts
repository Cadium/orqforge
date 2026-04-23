import Fastify from "fastify";

import { registerHealthRoutes } from "./interfaces/http/health-routes.js";

export function buildServer() {
  const server = Fastify({
    logger: true,
  });

  server.get("/api", async () => ({
    name: "orqforge-api",
    status: "ok",
  }));

  registerHealthRoutes(server);

  return server;
}
