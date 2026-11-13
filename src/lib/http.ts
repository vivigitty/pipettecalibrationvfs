import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from './errors';
import { logger } from './logger';

export function serialize(value: unknown): unknown { return z.json().parse(JSON.parse(JSON.stringify(value))); }

export function problem(error: unknown, requestId: string) {
  const validation = error instanceof z.ZodError;
  const conflict = error instanceof Prisma.PrismaClientKnownRequestError && ['P2002','P2034'].includes(error.code);
  const interrupted = error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2028';
  const status = error instanceof AppError ? error.status : validation ? 422 : conflict ? 409 : interrupted ? 503 : 500;
  if (status === 500) logger.error({ err: error, requestId, code: 'INTERNAL_ERROR' }, 'Request failed');
  if (interrupted) logger.error({ err: error,requestId,code: 'TRANSACTION_INTERRUPTED' },'Request transaction interrupted');
  return Response.json({ type: 'about:blank', title: status === 500 ? 'Internal server error' : 'Request rejected', status,
    detail: error instanceof AppError ? error.message : validation ? 'Please check the marked fields' : conflict ? 'Duplicate record or concurrent update; refresh and retry' : interrupted ? 'The database transaction was interrupted. Refresh to check whether your changes were saved before trying again.' : 'Unexpected error. Contact support with the request ID.',
    code: error instanceof AppError ? error.code : validation ? 'VALIDATION_ERROR' : conflict ? 'CONFLICT' : interrupted ? 'TRANSACTION_INTERRUPTED' : 'INTERNAL_ERROR', requestId,
    ...(validation ? { errors: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })) } : {}),
  }, { status, headers: { 'Content-Type': 'application/problem+json', 'X-Request-ID': requestId } });
}