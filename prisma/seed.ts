import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { readFile } from 'node:fs/promises';
import Decimal from 'decimal.js';
import { z } from 'zod';

const seedSchema = z.array(z.object({ temperature_c: z.string().refine((value) => new Decimal(value).gte(15) && new Decimal(value).lte(30)),pressure_kpa: z.string().refine((value) => new Decimal(value).gte(80) && new Decimal(value).lte(105)),z_value: z.string().regex(/^1\.\d{4}$/),source_version: z.string().min(1).max(80) })).length(217);
const db = new PrismaClient();

async function seed() {
  const raw: unknown = parse(await readFile('z_factors_iso8655.csv','utf8'),{ columns: true,skip_empty_lines: true });
  const rows = seedSchema.parse(raw);
  if (new Set(rows.map((row) => `${row.temperature_c}:${row.pressure_kpa}`)).size!==217) throw new Error('ISO reference grid contains duplicate points');
  await db.$transaction(async (tx) => {
    for (const row of rows) {
      const data = { temperatureC: row.temperature_c,pressureKpa: row.pressure_kpa,zValue: row.z_value,sourceVersion: row.source_version };
      await tx.zFactorReference.upsert({ where: { temperatureC_pressureKpa_sourceVersion: { temperatureC: data.temperatureC,pressureKpa: data.pressureKpa,sourceVersion: data.sourceVersion } },create: data,update: {} });
    }
    const email = process.env.SEED_ADMIN_EMAIL;
    const subject = process.env.SEED_ADMIN_SUBJECT;
    const name = process.env.SEED_ADMIN_NAME;
    if (email || subject || name) {
      const admin = z.object({ email: z.email(),subject: z.string().min(1).max(255),name: z.string().min(1).max(120) }).parse({ email,subject,name });
      await tx.user.upsert({ where: { externalSubject: admin.subject },create: { email: admin.email,displayName: admin.name,externalSubject: admin.subject,role: 'admin' },update: {} });
    }
  },{ timeout: 30000 });
}

seed().catch(() => { process.stderr.write('Seed failed. Check database access, CSV and optional admin variables.\n'); process.exitCode=1; }).finally(() => db.$disconnect());