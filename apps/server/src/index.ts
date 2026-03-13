import { buildApp } from "./http/app.js";
import { attachWebSocket } from "./ws/server.js";
import { config } from "./config.js";

const app = await buildApp();
await app.ready();

const server = app.server;
attachWebSocket(server);

server.listen(config.port, () => {
  app.log.info({ port: config.port }, "server listening");
});
