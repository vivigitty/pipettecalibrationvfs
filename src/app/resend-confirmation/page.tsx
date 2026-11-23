import Link from 'next/link';
import { redirect } from 'next/navigation';
import { resendConfirmation } from '@/lib/password-auth';
import { getEnv } from '@/lib/env';

const errors: Record<string,string> = {
  invalid: 'Enter a valid email address.',
  rate_limit: 'Too many emails have been requested. Wait a few minutes before trying again.',
  preview: 'Confirmation emails are unavailable in read-only preview mode.',
  unavailable: 'The confirmation email could not be requested. Please try again later or contact your administrator.',
};

export default async function ResendConfirmationPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error,sent } = await searchParams;
  return <main className="login-page"><div className="login-content"><div className="eyebrow">VFL SCIENCES</div><h1>Resend confirmation email</h1>
    <p>Enter the email you registered with and we will send a new confirmation link. Your access request is already with the administrator.</p>
    {sent ? <p role="status" className="confirmation-notice">If that address has an unconfirmed account, a new confirmation email is on its way. Check your inbox and spam folder, and use the newest link.</p> : null}
    {error ? <p role="alert">{errors[error] ?? errors.unavailable}</p> : null}
    <form action={async (formData: FormData) => {
      'use server';
      if (getEnv().APP_MODE!=='live') redirect('/resend-confirmation?error=preview');
      let outcome: Awaited<ReturnType<typeof resendConfirmation>> | 'unavailable';
      try { outcome = await resendConfirmation(formData.get('email')); } catch { outcome = 'unavailable'; }
      redirect(outcome==='sent' ? '/resend-confirmation?sent=1' : `/resend-confirmation?error=${outcome}`);
    }}>
      <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
      <button className="button primary" type="submit">Send confirmation email</button>
      <Link href="/login">Back to sign in</Link>
    </form>
  </div></main>;
}
