import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ResourceList } from '@/features/shared/ResourceList';
import { pageActor } from '@/lib/page-actor';
import { resourceSchema } from '@/schemas/resources';

export default async function ResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  const parsed = resourceSchema.safeParse((await params).resource);
  if (!parsed.success) notFound();
  const actor = await pageActor();
  if (parsed.data==='users' && actor.role!=='admin') notFound();
  return <AppShell actor={actor} active={parsed.data}><Suspense fallback={<p>Loading...</p>}><ResourceList resource={parsed.data} actor={actor} /></Suspense></AppShell>;
}