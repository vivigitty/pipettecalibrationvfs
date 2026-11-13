import { CredentialsSignin } from 'next-auth';
import { db } from './db';

export class ApprovalRequiredError extends CredentialsSignin {
  override code = 'approval_required';
}

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
  if (user.email.toLowerCase() !== identity.email.toLowerCase()) return null;
  if (!user.isActive) throw new ApprovalRequiredError();
  return { id: identity.id, email: identity.email, name: user.displayName };
}