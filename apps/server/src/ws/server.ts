import type { Server } from "http";
import { WebSocketServer } from "ws";

export function attachWebSocket(server: Server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "welcome" }));
  });

  return wss;
}
