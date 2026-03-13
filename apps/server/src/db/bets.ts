import { db } from "./index.js";

export async function createBet(params: {
  id: string;
  userId: string;
  roundId: string;
  amount: number;
}) {
  await db.query(
    `INSERT INTO bets (id, user_id, round_id, amount, result)
     VALUES ($1,$2,$3,$4,'pending')`,
    [params.id, params.userId, params.roundId, params.amount.toString()]
  );
}

export async function settleBet(params: {
  betId: string;
  result: "won" | "lost";
  cashoutMultiplier: number | null;
}) {
  await db.query(
    `UPDATE bets SET result = $1, cashout_multiplier = $2 WHERE id = $3`,
    [params.result, params.cashoutMultiplier, params.betId]
  );
}
