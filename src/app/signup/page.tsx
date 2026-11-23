import Link from 'next/link';
import { redirect } from 'next/navigation';
import { registerAccount } from '@/lib/password-auth';
import { recordAccessRequest } from '@/lib/access-request';
import { getEnv } from '@/lib/env';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error, sent } = await searchParams;
  return <main className="login-page"><div className="login-content"><div className="eyebrow">VFL SCIENCES</div><h1>{sent ? 'Check your email' : 'Create account'}</h1>
    {sent ? <div role="status" className="signup-next">
      <p><strong>Your account has been created and your access request has been sent to the administrator.</strong></p>
      <ol>
        <li>Open the confirmation email and click the link to verify your address. You will be returned to the sign-in page.</li>
        <li>An administrator reviews your request in User access and approves your role. You don&apos;t need to do anything for this step.</li>
        <li>Once approved, sign in with the same email and password.</li>
      </ol>
      <p className="muted">If you sign in before approval, you will see a reminder that approval is pending. No approval email is sent; contact your administrator if it takes longer than expected.</p>
      <p className="muted">No email after a few minutes? Check your spam folder, then <Link href="/resend-confirmation">send a new confirmation email</Link>.</p>
      <Link className="button primary" href="/login">Go to sign in</Link>
    </div> : <>
      <ol>
        <li>Create your account. Your access request is sent to the administrator straight away.</li>
        <li>Confirm your email using the link we send you.</li>
        <li>Sign in once an administrator has approved your access.</li>
      </ol>
      <form action={async (formData: FormData) => {
        'use server';
        let isAccepted = false;
        if (getEnv().APP_MODE === 'live') {
          try {
            const result = await registerAccount({ email: formData.get('email'), password: formData.get('password') });
            isAccepted = result.isAccepted;
            if (result.identity) await recordAccessRequest(result.identity);
          } catch {
            isAccepted = false;
          }
        }
        redirect(isAccepted ? '/signup?sent=1' : '/signup?error=registration');
      }}>
        <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
        <div><label htmlFor="password">Password (12 characters minimum)</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></div>
        {error ? <p role="alert">Registration could not be completed. Check your details or try again later.</p> : null}
        <button className="button primary" type="submit">Create account</button>
        <Link href="/login">Already have an account? Sign in</Link>
      </form>
    </>}
  </div></main>;
}
