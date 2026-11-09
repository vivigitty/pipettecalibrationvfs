import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { CalibrationWorkspace } from '@/features/calibration/CalibrationWorkspace';
import { pageActor } from '@/lib/page-actor';
import { idSchema } from '@/schemas/resources';

export default async function CalibrationPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const actor = await pageActor();
  const id = idSchema.parse((await params).sessionId);
  return <AppShell actor={actor} active="assets"><Suspense fallback={<p>Loading...</p>}><CalibrationWorkspace id={id} isReadOnly={actor.isPreview || actor.role==='executive'} isExecutive={actor.role==='executive'} isAdmin={actor.role==='admin'} /></Suspense></AppShell>;
}