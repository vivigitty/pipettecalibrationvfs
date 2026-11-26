'use client';

import Link from 'next/link';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { ArrowLeft,CheckCircle2,FileDown } from 'lucide-react';
import { rowSchema } from '@/schemas/resources';
import { api,text,rows } from '@/features/shared/api';
import { Status } from '@/components/ui/Status';
import { AllLotsForm } from './AllLotsForm';
import { CertificateOptionsForm } from './CertificateOptionsForm';

const workspaceSchema = z.object({ session: rowSchema,asset: rowSchema,lab: rowSchema,range: rowSchema.optional(),volumes: z.array(rowSchema),lots: z.array(rowSchema) });

/** Same rounding as the certificate (half up), so the screen and the PDF always agree. */
function fixed(value: string, places: number) { return value ? new Decimal(value).toFixed(places) : '-'; }

export function CalibrationWorkspace({ id,isReadOnly,isExecutive }: { id: string; isReadOnly: boolean; isExecutive: boolean }) {
  const client = useQueryClient();
  const [showCertificateOptions,setShowCertificateOptions] = useState(false);
  const query = useQuery({ queryKey: ['session',id],queryFn: async () => workspaceSchema.parse(await api(`sessions/${id}`)) });
  const complete = useMutation({ mutationFn: () => api(`sessions/${id}/complete`,'POST',{}),onSuccess: () => client.invalidateQueries({ queryKey: ['session',id] }) });
  if (query.isPending) return <p role="status">Loading calibration...</p>;
  if (query.isError) return <p role="alert" className="field-error">{query.error.message}</p>;
  const { session,asset,lab,range,lots,volumes } = query.data;
  const channelCount = Number(text(range,'channelCount')) || 1;
  const volumeLabel = (volume: string) => `${fixed(volume,0)} uL${channelCount>1 ? ` × ${channelCount}` : ''}`;
  const isClosed = text(session,'status')!=='in_progress';
  const isReadyToComplete = lots.length>0 && lots.every((lot) => rows(lot.readings).length===10);
  const facts = [['Calibration date',text(session,'processDate').slice(0,10)],['Next calibration due',text(session,'dueDate').slice(0,10)],['Reminder date',text(session,'reminderDate').slice(0,10)],['Z correction',text(lab,'zCorrectionValue')],['Serviced by',text(session,'servicedBy') || '-']];
  return <><Link className="back-link" href={`/assets/${text(asset,'id')}`}><ArrowLeft size={15} />Pipette details</Link><div className="page-heading"><div><div className="eyebrow">Session {text(session,'sessionNo')}</div><h1>{text(asset,'inventoryNumber')}</h1></div><Status value={text(session,'finalStatus')} /></div>
    <dl className="asset-facts">{facts.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="calibration-layout"><section className="workspace-main reading-section"><AllLotsForm key={lots.map((lot) => rows(lot.readings).length).join('-')} sessionId={id} lots={lots} channelCount={channelCount} isReadOnly={isReadOnly || isClosed} /></section>
      <aside className="result-sidebar"><h2>Pooled volume results</h2>{volumes.map((volume) => {
          const volumeLots = lots.filter((lot) => text(lot,'calibrationVolumeResultId')===text(volume,'id'));
          return <div className="volume-result" key={text(volume,'id')}><h3>Volume set {volumeLabel(text(volume,'nominalVolumeUl'))} <span className="muted">{text(volume,'readingCount') || '0'} readings</span></h3>
            <div>Mean <strong>{fixed(text(volume,'meanVolumeUl'),4)} uL</strong></div>
            {volumeLots.length>1 ? <ul className="lot-means" aria-label={`Mean volume per lot for ${volumeLabel(text(volume,'nominalVolumeUl'))}`}>{volumeLots.map((lot) => <li key={text(lot,'id')}>Lot {text(lot,'lotNo')}{text(lot,'channelNo') ? ` · Ch ${text(lot,'channelNo')}` : ''}: <strong>{fixed(text(lot,'meanVolumeUl'),4)} uL</strong></li>)}</ul> : null}
            <div>Inaccuracy <strong>{fixed(text(volume,'inaccuracyActualPct'),4)}%</strong> <span className="muted">limit ± {fixed(text(volume,'inaccuracyLimitPct'),1)}%</span></div><Status value={text(volume,'inaccuracyResult')} />
            <div>Imprecision <strong>{fixed(text(volume,'imprecisionActualPct'),4)}%</strong> <span className="muted">limit ± {fixed(text(volume,'imprecisionLimitPct'),1)}%</span></div><Status value={text(volume,'imprecisionResult')} /></div>;
        })}
        <button className="button primary full-width" disabled={isReadOnly || isClosed || !isReadyToComplete || complete.isPending} onClick={() => { complete.mutate(); }}><CheckCircle2 size={16} />Complete calibration</button>{!isClosed && !isReadyToComplete ? <p className="muted">Save readings for every lot to enable completion.</p> : null}{complete.isError ? <p role="alert" className="field-error">{complete.error.message}</p> : null}
        <div className="certificate-section"><h2>Certificate</h2>{text(session,'finalStatus')==='pass' ? <><button className="button secondary full-width" type="button" onClick={() => { setShowCertificateOptions((value) => !value); }}><FileDown size={16} />{showCertificateOptions ? 'Hide options' : 'Download certificate'}</button>{showCertificateOptions ? <CertificateOptionsForm sessionIds={[id]} onDone={() => { setShowCertificateOptions(false); }} /> : null}</> : <button className="button secondary full-width" disabled><FileDown size={16} />Complete and pass session to download</button>}</div>
        {isExecutive ? <div className="executive-section"><h2>Executive metadata</h2>{['deviceIp','entryLocation','startTime','endTime'].map((key) => <p key={key}><span>{key}</span> {text(session,key) || 'Not captured'}</p>)}</div> : null}
      </aside>
    </div>
  </>;
}
