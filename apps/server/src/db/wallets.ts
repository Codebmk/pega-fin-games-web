import { ulid } from "ulid";
import { db } from "./index.js";

export type WalletRecord = {
  id: string;
  user_id: string;
  balance: string;
  currency: string;
  updated_at: string;
};

export async function getWalletByUserId(userId: string) {
  const result = await db.query<WalletRecord>(
    `SELECT * FROM wallets WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function adjustBalance(params: {
  userId: string;
  amount: number;
  type: "deposit" | "bet" | "win" | "withdrawal";
  status: "pending" | "completed" | "failed";
  referenceId?: string | null;
}) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const walletRes = await client.query<WalletRecord>(
      `SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [params.userId]
    );
    const wallet = walletRes.rows[0];
    if (!wallet) {
      throw new Error("wallet_not_found");
    }

    const current = Number(wallet.balance);
    const next = current + params.amount;
    if (next < 0) {
      throw new Error("insufficient_funds");
    }

    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2`,
      [next, wallet.id]
    );

    const txId = ulid();
    await client.query(
      `INSERT INTO transactions (id, user_id, type, amount, status)
       VALUES ($1,$2,$3,$4,$5)`,
      [txId, params.userId, params.type, params.amount.toString(), params.status]
    );

    await client.query("COMMIT");
    return { walletId: wallet.id, txId, balance: next };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createWithdrawal(params: {
  userId: string;
  amount: number;
  walletAddress: string;
}) {
  const id = ulid();
  await db.query(
    `INSERT INTO withdrawals (id, user_id, amount, wallet_address, status)
     VALUES ($1,$2,$3,$4,'pending')`,
    [id, params.userId, params.amount.toString(), params.walletAddress]
  );
  return id;
}

export async function listWithdrawals(limit = 50) {
  const result = await db.query(
    `SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function updateWithdrawalStatus(params: {
  withdrawalId: string;
  status: "approved" | "rejected" | "paid";
}) {
  await db.query(
    `UPDATE withdrawals SET status = $1 WHERE id = $2`,
    [params.status, params.withdrawalId]
  );
}

export async function listTransactions(userId: string, limit = 50) {
  const result = await db.query(
    `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}
