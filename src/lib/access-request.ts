import { CredentialsSignin } from 'next-auth';
import { db } from './db';

export class ApprovalRequiredError extends CredentialsSignin {
  override code = 'approval_required';
}

export class EmailUnconfirmedError extends CredentialsSignin {
  override code = 'email_unconfirmed';
}

const pendingRequest = (identity: { id: string; email: string }) => ({
  externalSubject: identity.id,
  email: identity.email,
  displayName: identity.email,
  role: 'executive' as const,
  isActive: false,
});

/**
 * Files the inactive access request as soon as the account is created, so administrators can review it while the
 * user confirms their email. Never activates or changes an existing record; sign-in still requires a confirmed email.
 */
export async function recordAccessRequest(identity: { id: string; email: string }) {
  try {
    await db.user.upsert({ where: { externalSubject: identity.id }, create: pendingRequest(identity), update: {} });
    return true;
  } catch {
    // An app user with this email but a different identity already exists; the administrator resolves that manually.
    return false;
  }
}

export async function requestAccess(identity: { id: string; email: string }) {
  const user = await db.user.upsert({
    where: { externalSubject: identity.id },
    create: pendingRequest(identity),
    update: {},
  });
  if (user.email.toLowerCase() !== identity.email.toLowerCase()) return null;
  if (!user.isActive) throw new ApprovalRequiredError();
  return { id: identity.id, email: identity.email, name: user.displayName };
}