import http from "node:http";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      app: "orqforge-hello-node",
      status: "ok",
      message: "Hello from the Orqforge sample app.",
    }),
  );
});

server.listen(port, "0.0.0.0", () => {
  console.log(`orqforge-hello-node listening on ${port}`);
});
