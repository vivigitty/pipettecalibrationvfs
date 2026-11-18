import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_MODE: z.enum(['live', 'preview']).default('live'),
  DATABASE_URL: z.url().optional(),
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_URL: z.url().default('http://127.0.0.1:3000'),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  Z_SOURCE_VERSION: z.string().default('ISO8655-6:2022-TableA1-transcribed-UNVERIFIED'),
  CERTIFICATE_TEMPLATE_APPROVED: z.enum(['true', 'false']).default('false'),
  CERTIFICATE_LOGO_URL: z.string().optional(), CERTIFICATE_FOOTER: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && env.APP_MODE === 'preview') ctx.addIssue({ code: 'custom', message: 'Preview mode is forbidden in production' });
  if (env.APP_MODE === 'live') {
    for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in live mode` });
    }
  }
  if (env.NODE_ENV === 'production' && env.Z_SOURCE_VERSION.includes('UNVERIFIED')) ctx.addIssue({ code: 'custom', path: ['Z_SOURCE_VERSION'], message: 'ISO reference must be human-verified before production' });
});

export function getEnv() { return envSchema.parse(process.env); }