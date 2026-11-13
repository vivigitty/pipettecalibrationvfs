import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from './errors';
import { logger } from './logger';

export function serialize(value: unknown): unknown { return z.json().parse(JSON.parse(JSON.stringify(value))); }

export function problem(error: unknown, requestId: string) {
  const validation = error instanceof z.ZodError;
  const conflict = error instanceof Prisma.PrismaClientKnownRequestError && ['P2002','P2034'].includes(error.code);
  const status = error instanceof AppError ? error.status : validation ? 422 : conflict ? 409 : 500;
  if (status === 500) logger.error({ err: error, requestId, code: 'INTERNAL_ERROR' }, 'Request failed');
  return Response.json({ type: 'about:blank', title: status === 500 ? 'Internal server error' : 'Request rejected', status,
    detail: error instanceof AppError ? error.message : validation ? 'Please check the marked fields' : conflict ? 'Duplicate record or concurrent update; refresh and retry' : 'Unexpected error. Contact support with the request ID.',
    code: error instanceof AppError ? error.code : validation ? 'VALIDATION_ERROR' : conflict ? 'CONFLICT' : 'INTERNAL_ERROR', requestId,
    ...(validation ? { errors: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })) } : {}),
  }, { status, headers: { 'Content-Type': 'application/problem+json', 'X-Request-ID': requestId } });
}