import Link from 'next/link';
import { recoveryTokenSchema } from '@/lib/password-recovery';
import { confirmResetLink } from '../actions';

export const metadata = { robots: { index: false,follow: false } };

export default async function ConfirmResetPage({ searchParams }: { searchParams: Promise<{ token_hash?: string }> }) {
  const { token_hash: tokenHash } = await searchParams;
  const parsed = recoveryTokenSchema.safeParse(tokenHash);
  return <main className="login-page"><div className="login-content"><div className="eyebrow">VFL SCIENCES</div><h1>Confirm password reset</h1>
    {parsed.success ? <><p>Continue only if you requested a password reset. This single-use link will be verified when you continue, not when this page is opened.</p>
      <form action={confirmResetLink}><input type="hidden" name="token_hash" value={parsed.data} /><button className="button primary" type="submit">Continue to reset password</button><Link href="/login">Cancel</Link></form>
    </> : <><p role="alert">This reset link is invalid or incomplete. Request a new reset email and use the newest link.</p><Link href="/forgot-password">Request a new reset link</Link></>}
  </div></main>;
}
