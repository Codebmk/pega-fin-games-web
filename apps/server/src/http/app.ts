import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { createUser, getUserById, getUserByPhone, listUsers, updateKycUrls } from "../db/users.js";
import { adjustBalance, createWithdrawal, getWalletByUserId, listTransactions, listWithdrawals, updateWithdrawalStatus } from "../db/wallets.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { isAdult } from "../utils/age.js";
import { signToken, requireAuth } from "./auth.js";
import { uploadKycImage } from "../storage/supabase.js";
import { config } from "../config.js";

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: config.webOrigin ?? true,
    credentials: true
  });

  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024
    }
  });

  app.get("/health", async () => {
    return { ok: true };
  });

  app.post("/auth/register", async (request, reply) => {
    const schema = z.object({
      phone: z.string().min(6),
      password: z.string().min(8),
      email: z.string().email().optional(),
      dob: z.string(),
      country: z.string().min(2),
      nationality: z.string().min(2),
      govIdNumber: z.string().min(3)
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    if (!isAdult(parsed.data.dob)) {
      return reply.code(400).send({ error: "must_be_18" });
    }

    const existing = await getUserByPhone(parsed.data.phone);
    if (existing) {
      return reply.code(409).send({ error: "phone_exists" });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const userId = await createUser({
      phone: parsed.data.phone,
      passwordHash,
      email: parsed.data.email,
      dob: parsed.data.dob,
      country: parsed.data.country,
      nationality: parsed.data.nationality,
      govIdNumber: parsed.data.govIdNumber
    });

    const token = signToken({ id: userId, isAdmin: false });
    return reply.send({ token, userId });
  });

  app.post("/auth/login", async (request, reply) => {
    const schema = z.object({
      phone: z.string().min(6),
      password: z.string().min(8)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    const user = await getUserByPhone(parsed.data.phone);
    if (!user) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const ok = await verifyPassword(parsed.data.password, user.password_hash);
    if (!ok) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const token = signToken({ id: user.id, isAdmin: user.is_admin });
    return reply.send({ token, userId: user.id });
  });

  app.get("/me", async (request, reply) => {
    try {
      const auth = await requireAuth(request);
      const user = await getUserById(auth.id);
      if (!user) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      return reply.send({
        userId: auth.id,
        isAdmin: auth.isAdmin,
        kycStatus: user.kyc_status
      });
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.post("/kyc/upload", async (request, reply) => {
    let auth;
    try {
      auth = await requireAuth(request);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const parts = request.files();
    let front: { data: Buffer; contentType: string } | null = null;
    let back: { data: Buffer; contentType: string } | null = null;

    for await (const part of parts) {
      if (part.type !== "file") continue;
      const data = await part.toBuffer();
      if (part.fieldname === "front") {
        front = { data, contentType: part.mimetype };
      } else if (part.fieldname === "back") {
        back = { data, contentType: part.mimetype };
      }
    }

    if (!front || !back) {
      return reply.code(400).send({ error: "missing_files" });
    }

    const frontUrl = await uploadKycImage({
      userId: auth.id,
      side: "front",
      data: front.data,
      contentType: front.contentType
    });
    const backUrl = await uploadKycImage({
      userId: auth.id,
      side: "back",
      data: back.data,
      contentType: back.contentType
    });

    await updateKycUrls({
      userId: auth.id,
      frontUrl,
      backUrl
    });

    return reply.send({ ok: true, frontUrl, backUrl });
  });

  app.get("/admin/users", async (request, reply) => {
    let auth;
    try {
      auth = await requireAuth(request);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    if (!auth.isAdmin) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const users = await listUsers(50);
    return reply.send({
      users: users.map((user) => ({
        id: user.id,
        phone: user.phone,
        email: user.email,
        country: user.country,
        nationality: user.nationality,
        kycStatus: user.kyc_status,
        createdAt: user.created_at
      }))
    });
  });

  app.get("/wallet", async (request, reply) => {
    let auth;
    try {
      auth = await requireAuth(request);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const wallet = await getWalletByUserId(auth.id);
    if (!wallet) {
      return reply.code(404).send({ error: "wallet_not_found" });
    }
    return reply.send({ balance: wallet.balance, currency: wallet.currency });
  });

  app.get("/wallet/transactions", async (request, reply) => {
    let auth;
    try {
      auth = await requireAuth(request);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const txs = await listTransactions(auth.id, 50);
    return reply.send({ transactions: txs });
  });

  app.post("/wallet/withdraw", async (request, reply) => {
    let auth;
    try {
      auth = await requireAuth(request);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const schema = z.object({
      amount: z.coerce.number().positive(),
      walletAddress: z.string().min(10)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    try {
      await adjustBalance({
        userId: auth.id,
        amount: -parsed.data.amount,
        type: "withdrawal",
        status: "pending"
      });
    } catch (error) {
      if (error instanceof Error && error.message === "insufficient_funds") {
        return reply.code(400).send({ error: "insufficient_funds" });
      }
      throw error;
    }

    const withdrawalId = await createWithdrawal({
      userId: auth.id,
      amount: parsed.data.amount,
      walletAddress: parsed.data.walletAddress
    });
    return reply.send({ ok: true, withdrawalId });
  });

  app.get("/admin/withdrawals", async (request, reply) => {
    let auth;
    try {
      auth = await requireAuth(request);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (!auth.isAdmin) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const withdrawals = await listWithdrawals(50);
    return reply.send({ withdrawals });
  });

  app.post("/admin/withdrawals/:id", async (request, reply) => {
    let auth;
    try {
      auth = await requireAuth(request);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (!auth.isAdmin) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const schema = z.object({
      status: z.enum(["approved", "rejected", "paid"])
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }
    await updateWithdrawalStatus({
      withdrawalId: request.params["id" as never] as string,
      status: parsed.data.status
    });
    return reply.send({ ok: true });
  });

  app.post("/payments/webhook/coinbase", async (request, reply) => {
    const schema = z.object({
      event: z.object({
        type: z.string(),
        data: z.object({
          metadata: z.object({
            userId: z.string()
          }).optional(),
          payments: z.array(z.object({ value: z.object({ local: z.object({ amount: z.string() }) }) })).optional()
        })
      })
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    const eventType = parsed.data.event.type;
    if (eventType !== "charge:confirmed") {
      return reply.send({ ok: true });
    }

    const userId = parsed.data.event.data.metadata?.userId;
    const amountStr = parsed.data.event.data.payments?.[0]?.value?.local?.amount;
    if (!userId || !amountStr) {
      return reply.code(400).send({ error: "missing_metadata" });
    }
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      return reply.code(400).send({ error: "invalid_amount" });
    }

    await adjustBalance({
      userId,
      amount,
      type: "deposit",
      status: "completed"
    });

    return reply.send({ ok: true });
  });

  return app;
}
