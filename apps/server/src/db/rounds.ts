import { db } from "./index.js";

export async function createRound(params: {
  id: string;
  crashPoint: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}) {
  await db.query(
    `INSERT INTO rounds (id, crash_point, server_seed_hash, client_seed, nonce, start_time)
     VALUES ($1,$2,$3,$4,$5,NOW())`,
    [params.id, params.crashPoint, params.serverSeedHash, params.clientSeed, params.nonce]
  );
}

export async function finishRound(params: {
  id: string;
  endTime: Date;
  serverSeedReveal: string;
}) {
  await db.query(
    `UPDATE rounds SET end_time = $1, server_seed_reveal = $2 WHERE id = $3`,
    [params.endTime.toISOString(), params.serverSeedReveal, params.id]
  );
}
