import { db } from './db';

export async function requestAccess(identity: { id: string; email: string }) {
  const user = await db.user.upsert({
    where: { externalSubject: identity.id },
    create: {
      externalSubject: identity.id,
      email: identity.email,
      displayName: identity.email,
      role: 'executive',
      isActive: false,
    },
    update: {},
  });
  if (!user.isActive || user.email.toLowerCase() !== identity.email.toLowerCase()) return null;
  return { id: identity.id, email: identity.email, name: user.displayName };
}