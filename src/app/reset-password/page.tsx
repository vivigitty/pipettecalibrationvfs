import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { RECOVERY_COOKIE_NAME } from '@/lib/password-recovery';
import { changePassword } from './actions';

export const metadata = { robots: { index: false,follow: false } };

const errors: Record<string,string> = {
  password: 'Passwords must match and contain 12 to 128 characters. Choose a different, strong password that meets your organization\'s Supabase password policy.',
  rate_limit: 'Too many attempts. Wait a few minutes and try again, or request a new reset link.',
  preview: 'Password recovery is unavailable in read-only preview mode.',
  unavailable: 'The password could not be changed. Please try again or request a new reset link.',
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const cookieStore = await cookies();
  if (!cookieStore.get(RECOVERY_COOKIE_NAME)?.value) redirect('/forgot-password?error=invalid');
  const { error } = await searchParams;
  return <main className="login-page"><div className="login-content"><div className="eyebrow">VFL SCIENCES</div><h1>Set a new password</h1>
    <p>This reset session lasts up to 15 minutes. Changing your password does not change your role or administrator approval.</p>
    {error ? <p role="alert">{errors[error] ?? errors.unavailable}</p> : null}
    <form action={changePassword}>
      <div><label htmlFor="password">New password (12 characters minimum)</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></div>
      <div><label htmlFor="confirmation">Confirm new password</label><input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></div>
      <button className="button primary" type="submit">Reset password</button><Link href="/forgot-password">Request a new reset link</Link>
    </form>
  </div></main>;
}
