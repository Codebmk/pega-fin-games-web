export type Money = {
  amount: string;
  currency: "USDC";
};

export type RoundStatus = "waiting" | "betting" | "running" | "crashed";

export type BetResult = "pending" | "won" | "lost";

export type WsClientMessage =
  | { type: "join_round" }
  | { type: "place_bet"; amount: string; token: string }
  | { type: "cash_out"; token: string };

export type WsServerMessage =
  | { type: "round_start"; roundId: string; startsAt: string }
  | { type: "multiplier_update"; multiplier: number }
  | { type: "round_crash"; roundId: string; crashPoint: number }
  | { type: "bet_confirmed"; betId: string; amount: string }
  | { type: "cashout_success"; betId: string; payout: number }
  | { type: "server_seed_hash"; roundId: string; hash: string }
  | { type: "server_seed_reveal"; roundId: string; seed: string }
  | { type: "state"; state: unknown }
  | { type: "error"; message: string };
