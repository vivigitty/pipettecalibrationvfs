import Link from 'next/link';
import { requestReset } from '@/app/reset-password/actions';

const errors: Record<string,string> = {
  email: 'Enter a valid email address.',
  invalid: 'This reset link or session is invalid, expired or already used. Request a new email and use the newest link.',
  rate_limit: 'Too many requests. Wait a few minutes before requesting another reset email.',
  preview: 'Password recovery is unavailable in read-only preview mode.',
  unavailable: 'Password recovery is temporarily unavailable. Please try again later or contact your administrator.',
};

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error,sent } = await searchParams;
  return <main className="login-page"><div className="login-content"><div className="eyebrow">VFL SCIENCES</div><h1>Forgot password</h1>
    <p>Enter your account email to request a password-reset link.</p>
    {sent ? <p role="status">If an eligible account exists for this email, a reset email has been requested. Check your inbox and spam folder, and use the newest link.</p> : null}
    {error ? <p role="alert">{errors[error] ?? errors.unavailable}</p> : null}
    <form action={requestReset}><div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
      <button className="button primary" type="submit">Send reset link</button><Link href="/login">Back to sign in</Link>
    </form>
  </div></main>;
}
