import { signIn } from '@/lib/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="login-page"><div className="login-content"><div className="eyebrow">VFL SCIENCES</div><h1>Pipette calibration</h1><form action={async (formData: FormData) => {
    'use server';
    try {
      await signIn('credentials', { email: formData.get('email'), password: formData.get('password'), redirectTo: '/assets' });
    } catch (failure) {
      if (failure instanceof AuthError) redirect('/login?error=signin');
      throw failure;
    }
  }}>
    <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" maxLength={254} required /></div>
    <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required /></div>
    {error ? <p role="alert">Unable to sign in. Check your credentials and email confirmation. Verified new accounts must be approved by an administrator before access is granted.</p> : null}
    <button className="button primary" type="submit">Sign in</button>
    <Link href="/signup">Create account</Link>
  </form></div></main>;
}