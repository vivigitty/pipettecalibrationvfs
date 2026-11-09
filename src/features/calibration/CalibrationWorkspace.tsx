'use client';

import Link from 'next/link';
import { useRouter,useSearchParams } from 'next/navigation';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ArrowLeft,CheckCircle2,FileDown } from 'lucide-react';
import { rowSchema } from '@/schemas/resources';
import { api,text,rows } from '@/features/shared/api';
import { Status } from '@/components/ui/Status';
import { ReadingGrid } from './ReadingGrid';
import { VoidCertificateForm } from './VoidCertificateForm';

const workspaceSchema = z.object({ session: rowSchema,asset: rowSchema,lab: rowSchema,volumes: z.array(rowSchema),lots: z.array(rowSchema),certificates: z.array(rowSchema) });

export function CalibrationWorkspace({ id,isReadOnly,isExecutive,isAdmin }: { id: string; isReadOnly: boolean; isExecutive: boolean; isAdmin: boolean }) {
  const client = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const query = useQuery({ queryKey: ['session',id],queryFn: async () => workspaceSchema.parse(await api(`sessions/${id}`)) });
  const complete = useMutation({ mutationFn: () => api(`sessions/${id}/complete`,'POST',{}),onSuccess: () => client.invalidateQueries({ queryKey: ['session',id] }) });
  const certificate = useMutation({ mutationFn: () => api(`sessions/${id}/certificates`,'POST',{}),onSuccess: () => client.invalidateQueries({ queryKey: ['session',id] }) });
  if (query.isPending) return <p role="status">Loading calibration...</p>;
  if (query.isError) return <p role="alert" className="field-error">{query.error.message}</p>;
  const { session,asset,lab,lots,volumes,certificates } = query.data;
  const active = lots.find((lot) => text(lot,'lotNo')===(params.get('lot') ?? '1')) ?? lots[0];
  const isClosed = text(session,'status')!=='in_progress';
  return <><Link className="back-link" href={`/assets/${text(asset,'id')}`}><ArrowLeft size={15} />Pipette details</Link><div className="page-heading"><div><div className="eyebrow">Session {text(session,'sessionNo')}</div><h1>{text(asset,'inventoryNumber')}</h1></div><Status value={text(session,'finalStatus')} /></div>
    <dl className="asset-facts">{[['Process date',text(session,'processDate').slice(0,10)],['Next calibration due',text(session,'dueDate').slice(0,10)],['Reminder date',text(session,'reminderDate').slice(0,10)],['Z correction',text(lab,'zCorrectionValue')]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="calibration-layout"><section className="workspace-main"><div className="lot-tabs" role="tablist" aria-label="Calibration lots">{lots.map((lot) => <button key={text(lot,'id')} role="tab" aria-selected={lot.id===active?.id} onClick={() => { const next = new URLSearchParams(params); next.set('lot',text(lot,'lotNo')); router.push(`/calibrations/${id}?${next}`); }}>Lot {text(lot,'lotNo')}<small>{text(lot,'nominalVolumeUl')} uL</small></button>)}</div>
      {active ? <div className="reading-section" role="tabpanel"><ReadingGrid key={text(active,'id')} sessionId={id} lot={active} readings={rows(active.readings)} isReadOnly={isReadOnly || isClosed} /></div> : null}</section>
      <aside className="result-sidebar"><h2>Pooled volume results</h2>{volumes.map((volume) => <div className="volume-result" key={text(volume,'id')}><h3>{text(volume,'nominalVolumeUl')} uL <span className="muted">{text(volume,'readingCount') || '0'} readings</span></h3><div>Inaccuracy <strong>{text(volume,'inaccuracyActualPct').slice(0,12) || '-'}%</strong></div><Status value={text(volume,'inaccuracyResult')} /><div>Imprecision <strong>{text(volume,'imprecisionActualPct').slice(0,12) || '-'}%</strong></div><Status value={text(volume,'imprecisionResult')} /></div>)}
        <button className="button primary full-width" disabled={isReadOnly || isClosed || complete.isPending} onClick={() => { complete.mutate(); }}><CheckCircle2 size={16} />Complete session</button>{complete.isError ? <p role="alert" className="field-error">{complete.error.message}</p> : null}
        <div className="certificate-section"><h2>Certificate</h2>{certificates.length ? certificates.map((row) => <a className="button secondary full-width" key={text(row,'id')} href={`/api/v1/certificates/${text(row,'id')}`}><FileDown size={16} />Download stored PDF</a>) : <button className="button secondary full-width" disabled={isReadOnly || text(session,'finalStatus')!=='pass' || certificate.isPending} onClick={() => { certificate.mutate(); }}><FileDown size={16} />Generate PDF</button>}{certificate.isError ? <p role="alert" className="field-error">{certificate.error.message}</p> : null}</div>
        {isExecutive ? <div className="executive-section"><h2>Executive metadata</h2>{['deviceIp','entryLocation','startTime','endTime'].map((key) => <p key={key}><span>{key}</span> {text(session,key) || 'Not captured'}</p>)}</div> : null}
        {isAdmin ? certificates.map((row) => <VoidCertificateForm key={text(row,'id')} id={text(row,'id')} sessionId={id} />) : null}
      </aside>
    </div>
  </>;
}