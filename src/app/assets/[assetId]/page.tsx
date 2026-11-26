import { AppShell } from '@/components/AppShell';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { pageActor } from '@/lib/page-actor';
import { idSchema } from '@/schemas/resources';

export default async function AssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const actor = await pageActor();
  const id = idSchema.parse((await params).assetId);
  return <AppShell actor={actor} active="assets"><AssetDetail id={id} defaultServicedBy={actor.displayName} isReadOnly={actor.isPreview || actor.role==='executive'} canManageInstruments={actor.isPreview || actor.role!=='executive'} isAdmin={actor.role==='admin'} /></AppShell>;
}