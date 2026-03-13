import type { Server } from "http";
import { WebSocketServer } from "ws";
import { GameEngine } from "../game/engine.js";
import { verifyToken } from "../http/auth.js";

export function attachWebSocket(server: Server) {
  const wss = new WebSocketServer({ server });

  const engine = new GameEngine((message) => {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  });

  engine.start();

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "welcome" }));

    socket.on("message", async (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === "join_round") {
          socket.send(JSON.stringify({ type: "state", state: engine.getState() }));
          return;
        }
        if (parsed.type === "place_bet") {
          const token = parsed.token as string | undefined;
          if (!token) throw new Error("unauthorized");
          const payload = verifyToken(token);
          const betId = await engine.placeBet(payload.id, Number(parsed.amount));
          socket.send(JSON.stringify({ type: "bet_confirmed", betId, amount: parsed.amount }));
          return;
        }
        if (parsed.type === "cash_out") {
          const token = parsed.token as string | undefined;
          if (!token) throw new Error("unauthorized");
          const payload = verifyToken(token);
          const result = await engine.cashOut(payload.id);
          socket.send(JSON.stringify({ type: "cashout_success", betId: result.betId, payout: result.payout }));
          return;
        }
      } catch (error) {
        socket.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "unknown" }));
      }
    });
  });

  return wss;
}
