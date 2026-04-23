import { buildServer } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const host = process.env.HOST ?? "0.0.0.0";

const server = buildServer();

server.listen({ host, port }).catch((error) => {
  server.log.error(error, "Failed to start Orqforge API");
  process.exit(1);
});
