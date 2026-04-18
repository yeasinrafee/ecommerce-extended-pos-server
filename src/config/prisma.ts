import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from './env.js';

const pool = new Pool({
  connectionString: env.databaseUrl
});

const adapter = new PrismaPg(pool as any);

export const prisma = new PrismaClient({
  adapter,
  log: env.isProduction ? ['error'] : ['query', 'info', 'warn', 'error']
});
