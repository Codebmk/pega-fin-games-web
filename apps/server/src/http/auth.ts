import jwt from "jsonwebtoken";
import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { getUserById } from "../db/users.js";

export type AuthUser = {
  id: string;
  isAdmin: boolean;
};

export function signToken(user: AuthUser) {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, config.jwtSecret) as AuthUser;
}

export async function requireAuth(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }
  const token = header.slice("Bearer ".length);
  const payload = verifyToken(token);
  const user = await getUserById(payload.id);
  if (!user) {
    throw new Error("Unauthorized");
  }
  return { id: user.id, isAdmin: user.is_admin };
}
