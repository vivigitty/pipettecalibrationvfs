import { signIn } from '@/lib/auth';
import { AuthError,CredentialsSignin } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ConfirmationNotice } from './ConfirmationNotice';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; code?: string; reset?: string }> }) {
  const { error,code,reset } = await searchParams;
  const needsApproval = error==='approval' || (error==='CredentialsSignin' && code==='approval_required');
  const needsConfirmation = error==='unconfirmed' || (error==='CredentialsSignin' && code==='email_unconfirmed');
  return <main className="login-page"><div className="login-content"><img src="/public/VFL_Logo.png" alt="VFL Sciences logo" className="login-logo" /><div className="eyebrow">VFL SCIENCES</div><h1>Pipette calibration</h1><ConfirmationNotice />{reset==='1' ? <p role="status">Your password has been updated. Sign in with your new password. Existing administrator approval requirements still apply.</p> : null}<form action={async (formData: FormData) => {
    'use server';
    try {
      await signIn('credentials', { email: formData.get('email'), password: formData.get('password'), redirectTo: '/assets' });
    } catch (failure) {
      if (failure instanceof CredentialsSignin && failure.code==='approval_required') redirect('/login?error=approval');
      if (failure instanceof CredentialsSignin && failure.code==='email_unconfirmed') redirect('/login?error=unconfirmed');
      if (failure instanceof AuthError) redirect('/login?error=signin');
      throw failure;
    }
  }}>
    <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" maxLength={254} required /></div>
    <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required /></div>
    {needsApproval ? <p role="status">Your email is confirmed and your access request is waiting for administrator approval. Sign in again with the same email and password once you have been approved. Contact your administrator if you need access sooner.</p> : needsConfirmation ? <p role="alert">Your email address has not been confirmed yet. Click the link in the confirmation email, or <Link href="/resend-confirmation">send a new confirmation email</Link>. Check your spam folder too.</p> : error ? <p role="alert">Unable to sign in. Check your email and password. If you have just created your account, confirm your email using the link we sent first, or <Link href="/resend-confirmation">send a new confirmation email</Link>.</p> : null}
    <button className="button primary" type="submit">Sign in</button>
    <Link href="/forgot-password">Forgot password?</Link>
    <Link href="/signup">Create account</Link>
    <Link href="/resend-confirmation">Didn&apos;t get the confirmation email?</Link>
  </form></div></main>;
}