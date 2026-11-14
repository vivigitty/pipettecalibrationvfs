import { PrismaClient, type Prisma } from '@prisma/client';

function runtimeDatabaseOptions(): Prisma.PrismaClientOptions {
  const value = process.env.DATABASE_URL;
  if (!value) return {};
  if (!URL.canParse(value)) throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  const url = new URL(value);
  if (!['postgresql:','postgres:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit','1');
  return { datasourceUrl: url.toString() };
}

const globalDb = globalThis as typeof globalThis & { vflDb?: PrismaClient };
export const db = globalDb.vflDb ?? new PrismaClient(runtimeDatabaseOptions());
globalDb.vflDb = db;