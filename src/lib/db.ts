import { PrismaClient } from '@prisma/client';

const globalDb = globalThis as typeof globalThis & { vflDb?: PrismaClient };
export const db = globalDb.vflDb ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalDb.vflDb = db;