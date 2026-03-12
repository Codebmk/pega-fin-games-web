import { createServer } from "http";
import { buildApp } from "./http/app.js";
import { attachWebSocket } from "./ws/server.js";
import { config } from "./config.js";

const app = await buildApp();
const server = createServer(app);

attachWebSocket(server);

server.listen(config.port, () => {
  app.log.info({ port: config.port }, "server listening");
});
