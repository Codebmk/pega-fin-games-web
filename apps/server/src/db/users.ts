import { ulid } from "ulid";
import { db } from "./index.js";

export type UserRecord = {
  id: string;
  phone: string;
  password_hash: string;
  email: string | null;
  dob: string;
  country: string;
  nationality: string;
  gov_id_number: string;
  gov_id_front_url: string | null;
  gov_id_back_url: string | null;
  is_admin: boolean;
  kyc_status: string;
  created_at: string;
};

export async function createUser(params: {
  phone: string;
  passwordHash: string;
  email?: string | null;
  dob: string;
  country: string;
  nationality: string;
  govIdNumber: string;
}) {
  const id = ulid();
  await db.query(
    `INSERT INTO users (id, phone, password_hash, email, dob, country, nationality, gov_id_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`
    , [
      id,
      params.phone,
      params.passwordHash,
      params.email ?? null,
      params.dob,
      params.country,
      params.nationality,
      params.govIdNumber
    ]
  );
  await db.query(
    `INSERT INTO wallets (id, user_id, balance, currency) VALUES ($1,$2,0,'USDC')`,
    [ulid(), id]
  );
  return id;
}

export async function getUserByPhone(phone: string) {
  const result = await db.query<UserRecord>(
    `SELECT * FROM users WHERE phone = $1`,
    [phone]
  );
  return result.rows[0] ?? null;
}

export async function getUserById(userId: string) {
  const result = await db.query<UserRecord>(
    `SELECT * FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function updateKycUrls(params: {
  userId: string;
  frontUrl: string;
  backUrl: string;
}) {
  await db.query(
    `UPDATE users SET gov_id_front_url = $1, gov_id_back_url = $2, kyc_status = 'submitted'
     WHERE id = $3`,
    [params.frontUrl, params.backUrl, params.userId]
  );
}

export async function listUsers(limit = 50) {
  const result = await db.query<UserRecord>(
    `SELECT * FROM users ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}
