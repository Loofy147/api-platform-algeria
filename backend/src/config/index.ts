import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  nodeEnv: z.string().default('development'),
  port: z.coerce.number().default(3000),
  databaseUrl: z.string().url(),
  redisUrl: z.string().url(),
  jwtSecret: z.string().min(1),
  jwtRefreshSecret: z.string().min(1),
  allowedOrigins: z.string().transform((val) => val.split(',')),
  apiVersion: z.string().default('v1'),
});

const parsedConfig = configSchema.safeParse({
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  allowedOrigins: process.env.ALLOWED_ORIGINS,
  apiVersion: process.env.API_VERSION,
});

if (!parsedConfig.success) {
  console.error('Invalid environment variables:', parsedConfig.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsedConfig.data;
