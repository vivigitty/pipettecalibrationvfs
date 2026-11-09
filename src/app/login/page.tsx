import { signIn } from '@/lib/auth';

export default function LoginPage() {
  return <main className="login-page"><div className="login-content"><div className="eyebrow">VFL SCIENCES</div><h1>Pipette calibration</h1><form action={async () => { 'use server'; await signIn('microsoft-entra-id',{ redirectTo: '/assets' }); }}><button className="button primary">Sign in with Microsoft</button></form></div></main>;
}