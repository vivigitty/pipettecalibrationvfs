import { signIn } from '@/lib/auth';
import { AuthError,CredentialsSignin } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; code?: string; reset?: string }> }) {
  const { error,code,reset } = await searchParams;
  const needsApproval = error==='approval' || (error==='CredentialsSignin' && code==='approval_required');
  return <main className="login-page"><div className="login-content"><div className="eyebrow">VFL SCIENCES</div><h1>Pipette calibration</h1>{reset==='1' ? <p role="status">Your password has been updated. Sign in with your new password. Existing administrator approval requirements still apply.</p> : null}<form action={async (formData: FormData) => {
    'use server';
    try {
      await signIn('credentials', { email: formData.get('email'), password: formData.get('password'), redirectTo: '/assets' });
    } catch (failure) {
      if (failure instanceof CredentialsSignin && failure.code==='approval_required') redirect('/login?error=approval');
      if (failure instanceof AuthError) redirect('/login?error=signin');
      throw failure;
    }
  }}>
    <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" maxLength={254} required /></div>
    <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required /></div>
    {needsApproval ? <p role="status">Your email is verified, but application access is not approved or is inactive. Your account is available for administrator review in User access. After approval, sign in again with the same email and password; no second confirmation email is needed. Contact your administrator for an update.</p> : error ? <p role="alert">Unable to sign in. Check your email and password, and confirm your email using the latest confirmation link. After confirming, sign in once to submit your request for administrator approval.</p> : null}
    <button className="button primary" type="submit">Sign in</button>
    <Link href="/forgot-password">Forgot password?</Link>
    <Link href="/signup">Create account</Link>
  </form></div></main>;
}