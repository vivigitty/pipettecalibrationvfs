import { z } from 'zod';
import { rowSchema } from '@/schemas/resources';

const problemSchema = z.object({ detail: z.string(),requestId: z.string().optional(),errors: z.array(z.object({ field: z.string(),message: z.string() })).optional() });
export class ApiError extends Error {
  constructor(message: string, public readonly fields: { field: string; message: string }[] = []) { super(message); }
}
export async function api(path: string, method = 'GET', data?: unknown): Promise<unknown> {
  const response = await fetch(`/api/v1/${path}`, { method,headers: { 'Content-Type': 'application/json',...(path.endsWith('/certificates') ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },...(data!==undefined ? { body: JSON.stringify(data) } : {}) });
  const result: unknown = await response.json();
  if (!response.ok) {
    const problem = problemSchema.safeParse(result);
    throw new ApiError(problem.success ? problem.data.detail : 'Request failed',problem.success ? problem.data.errors ?? [] : []);
  }
  return result;
}
export function text(row: unknown, key: string) {
  const parsed = rowSchema.safeParse(row);
  const value = parsed.success ? parsed.data[key] : null;
  return typeof value==='string' || typeof value==='number' ? String(value) : '';
}
export function rows(value: unknown) { return z.array(rowSchema).parse(value); }