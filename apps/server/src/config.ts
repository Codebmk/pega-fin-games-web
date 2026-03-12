import fs from "fs";
import path from "path";
import { z } from "zod";

type EnvValue = string | undefined;

type EnvMap = Record<string, EnvValue>;

function readEnvFile(filePath: string): EnvMap {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const env: EnvMap = {};
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

function loadEnvFiles(): EnvMap {
  const cwd = process.cwd();
  const roots = [cwd, path.resolve(cwd, ".."), path.resolve(cwd, "../..")];
  const env: EnvMap = {};
  for (const root of roots) {
    Object.assign(env, readEnvFile(path.join(root, ".env")));
    Object.assign(env, readEnvFile(path.join(root, ".env.local")));
  }
  return env;
}

const mergedEnv = {
  ...loadEnvFiles(),
  ...process.env
};

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default("development"),
  WEB_ORIGIN: z.string().optional(),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  JWT_SECRET: z.string(),
  PAYMENT_PROVIDER: z.string().default("coinbase_commerce"),
  COINBASE_COMMERCE_API_KEY: z.string().optional(),
  COINBASE_COMMERCE_WEBHOOK_SECRET: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().optional()
});

const parsed = envSchema.safeParse(mergedEnv);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
  webOrigin: parsed.data.WEB_ORIGIN,
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  paymentProvider: parsed.data.PAYMENT_PROVIDER,
  coinbaseApiKey: parsed.data.COINBASE_COMMERCE_API_KEY,
  coinbaseWebhookSecret: parsed.data.COINBASE_COMMERCE_WEBHOOK_SECRET,
  supabase: {
    url: parsed.data.SUPABASE_URL,
    publishableKey: parsed.data.SUPABASE_PUBLISHABLE_KEY,
    secretKey: parsed.data.SUPABASE_SECRET_KEY,
    bucket: parsed.data.SUPABASE_STORAGE_BUCKET
  }
};
