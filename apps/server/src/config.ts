import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  JWT_SECRET: z.string(),
  PAYMENT_PROVIDER: z.string().default("coinbase_commerce"),
  COINBASE_COMMERCE_API_KEY: z.string().optional(),
  COINBASE_COMMERCE_WEBHOOK_SECRET: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  paymentProvider: parsed.data.PAYMENT_PROVIDER,
  coinbaseApiKey: parsed.data.COINBASE_COMMERCE_API_KEY,
  coinbaseWebhookSecret: parsed.data.COINBASE_COMMERCE_WEBHOOK_SECRET,
  storage: {
    endpoint: parsed.data.STORAGE_ENDPOINT,
    region: parsed.data.STORAGE_REGION,
    bucket: parsed.data.STORAGE_BUCKET,
    accessKey: parsed.data.STORAGE_ACCESS_KEY,
    secretKey: parsed.data.STORAGE_SECRET_KEY
  }
};
