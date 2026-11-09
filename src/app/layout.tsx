import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import { getEnv } from '@/lib/env';
import './globals.css';

export const metadata = { title: 'VFL Sciences | Pipette Calibration' };
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  getEnv();
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}