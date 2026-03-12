import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { createUser, getUserByPhone, listUsers, updateKycUrls } from "../db/users.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { isAdult } from "../utils/age.js";
import { signToken, requireAuth } from "./auth.js";
import { uploadKycImage } from "../storage/supabase.js";

export async function buildApp() {
  const app = Fastify({
    logger: true
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
      return reply.send({ userId: auth.id, isAdmin: auth.isAdmin });
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

  return app;
}
