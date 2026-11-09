import { z } from 'zod';
import { auth } from './auth';
import { db } from './db';
import { getEnv } from './env';
import { ForbiddenError, UnauthorizedError } from './errors';

export const actorSchema = z.object({ id: z.uuid(), displayName: z.string(), role: z.enum(['technician', 'admin', 'executive']), isPreview: z.boolean() });
export type Actor = z.infer<typeof actorSchema>;

export async function currentActor(): Promise<Actor> {
  if (getEnv().APP_MODE === 'preview') return { id: '00000000-0000-4000-8000-000000000001', displayName: 'Preview', role: 'executive', isPreview: true };
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const user = await db.user.findUnique({ where: { externalSubject: session.user.id } });
  if (!user?.isActive) throw new UnauthorizedError();
  return actorSchema.parse({ ...user, isPreview: false });
}

export function authorizeWrite(actor: Actor, isAdminOnly = false) {
  if (actor.isPreview) throw new ForbiddenError('Read-only preview: connect PostgreSQL and SSO to save records');
  if (actor.role === 'executive' || (isAdminOnly && actor.role !== 'admin')) throw new ForbiddenError();
}