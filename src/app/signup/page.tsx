import Link from 'next/link';
import { redirect } from 'next/navigation';
import { registerAccount } from '@/lib/password-auth';
import { getEnv } from '@/lib/env';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error, sent } = await searchParams;
  return <main className="login-page"><div className="login-content"><div className="eyebrow">VFL SCIENCES</div><h1>Create account</h1>
    {sent ? <p role="status">If registration is available for this address, a confirmation email has been sent. Follow the steps below; confirming your email does not grant application access automatically.</p> : null}
    <ol>
      <li>Create your account, then verify your email by clicking the confirmation link.</li>
      <li>After confirming, sign in once to submit your access request. You will not have application access yet.</li>
      <li>Ask an administrator to review your request in User access and approve the appropriate role.</li>
      <li>After approval, sign in again with the same email and password. No second email confirmation is required.</li>
    </ol>
    <p>Approval is handled in the app. No approval notification emails are currently sent; contact your administrator for an update.</p>
    <form action={async (formData: FormData) => {
      'use server';
      let accepted = false;
      if (getEnv().APP_MODE === 'live') {
        try {
          accepted = await registerAccount({ email: formData.get('email'), password: formData.get('password') });
        } catch {
          accepted = false;
        }
      }
      redirect(accepted ? '/signup?sent=1' : '/signup?error=registration');
    }}>
      <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
      <div><label htmlFor="password">Password (12 characters minimum)</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></div>
      {error ? <p role="alert">Registration could not be completed. Check your details or try again later.</p> : null}
      <button className="button primary" type="submit">Create account</button>
      <Link href="/login">Sign in</Link>
    </form>
  </div></main>;
}