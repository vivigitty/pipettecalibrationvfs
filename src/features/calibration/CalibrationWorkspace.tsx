'use client';

import Link from 'next/link';
import { useRouter,useSearchParams } from 'next/navigation';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { ArrowLeft,CheckCircle2,FileDown } from 'lucide-react';
import { rowSchema } from '@/schemas/resources';
import { api,text,rows } from '@/features/shared/api';
import { Status } from '@/components/ui/Status';
import { ReadingGrid } from './ReadingGrid';

const workspaceSchema = z.object({ session: rowSchema,asset: rowSchema,lab: rowSchema,volumes: z.array(rowSchema),lots: z.array(rowSchema) });

export function CalibrationWorkspace({ id,isReadOnly,isExecutive }: { id: string; isReadOnly: boolean; isExecutive: boolean }) {
  const client = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const [showCertificateOptions,setShowCertificateOptions] = useState(false);
  const [signatureDataUrl,setSignatureDataUrl] = useState<string | undefined>();
  const [signatureDateMode,setSignatureDateMode] = useState<'calibration' | 'current' | 'custom'>('calibration');
  const [customSignatureDate,setCustomSignatureDate] = useState('');
  const [certificateError,setCertificateError] = useState('');
  const [isDownloadingCertificate,setIsDownloadingCertificate] = useState(false);
  const query = useQuery({ queryKey: ['session',id],queryFn: async () => workspaceSchema.parse(await api(`sessions/${id}`)) });
  const complete = useMutation({ mutationFn: () => api(`sessions/${id}/complete`,'POST',{}),onSuccess: () => client.invalidateQueries({ queryKey: ['session',id] }) });
  if (query.isPending) return <p role="status">Loading calibration...</p>;
  if (query.isError) return <p role="alert" className="field-error">{query.error.message}</p>;
  const { session,asset,lab,lots,volumes } = query.data;
  const active = lots.find((lot) => text(lot,'lotNo')===(params.get('lot') ?? '1')) ?? lots[0];
  const isClosed = text(session,'status')!=='in_progress';
  const downloadCertificate = async () => {
    if (signatureDateMode==='custom' && !customSignatureDate) {
      setCertificateError('Select a custom signature date');
      return;
    }
    setCertificateError('');
    setIsDownloadingCertificate(true);
    try {
      const response = await fetch(`/api/v1/sessions/${id}/certificate-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureDataUrl,signatureDateMode,customSignatureDate: signatureDateMode==='custom' ? customSignatureDate : undefined }),
      });
      if (!response.ok) {
        const problem = z.object({ detail: z.string(),requestId: z.string().optional() }).safeParse(await response.json());
        throw new Error(problem.success ? `${problem.data.detail}${problem.data.requestId ? ` (Request ID: ${problem.data.requestId})` : ''}` : 'Certificate download failed');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `certificate_${id}.pdf`;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setShowCertificateOptions(false);
    } catch (error) { setCertificateError(error instanceof Error ? error.message : 'Certificate download failed'); }
    finally { setIsDownloadingCertificate(false); }
  };
  const uploadSignature = async (file: File | null) => {
    if (!file) { setSignatureDataUrl(undefined); return; }
    setSignatureDataUrl(await new Promise<string>((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result==='string' ? reader.result : '');
      };
      reader.onerror = () => {
        reject(new Error('Unable to read signature file'));
      };
      reader.readAsDataURL(file);
    }));
  };
  return <><Link className="back-link" href={`/assets/${text(asset,'id')}`}><ArrowLeft size={15} />Pipette details</Link><div className="page-heading"><div><div className="eyebrow">Session {text(session,'sessionNo')}</div><h1>{text(asset,'inventoryNumber')}</h1></div><Status value={text(session,'finalStatus')} /></div>
    <dl className="asset-facts">{[['Process date',text(session,'processDate').slice(0,10)],['Next calibration due',text(session,'dueDate').slice(0,10)],['Reminder date',text(session,'reminderDate').slice(0,10)],['Z correction',text(lab,'zCorrectionValue')],['Serviced by',text(session,'servicedBy') || '-']].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="calibration-layout"><section className="workspace-main"><div className="lot-tabs" role="tablist" aria-label="Calibration lots">{lots.map((lot) => <button key={text(lot,'id')} role="tab" aria-selected={lot.id===active?.id} onClick={() => { const next = new URLSearchParams(params); next.set('lot',text(lot,'lotNo')); router.push(`/calibrations/${id}?${next}`); }}>Lot {text(lot,'lotNo')}<small>{text(lot,'nominalVolumeUl')} uL</small></button>)}</div>
      {active ? <div className="reading-section" role="tabpanel"><ReadingGrid key={text(active,'id')} sessionId={id} lot={active} readings={rows(active.readings)} isReadOnly={isReadOnly || isClosed} /></div> : null}</section>
      <aside className="result-sidebar"><h2>Pooled volume results</h2>{volumes.map((volume) => <div className="volume-result" key={text(volume,'id')}><h3>{text(volume,'nominalVolumeUl')} uL <span className="muted">{text(volume,'readingCount') || '0'} readings</span></h3><div>Inaccuracy <strong>{text(volume,'inaccuracyActualPct').slice(0,12) || '-'}%</strong></div><Status value={text(volume,'inaccuracyResult')} /><div>Imprecision <strong>{text(volume,'imprecisionActualPct').slice(0,12) || '-'}%</strong></div><Status value={text(volume,'imprecisionResult')} /></div>)}
        <button className="button primary full-width" disabled={isReadOnly || isClosed || complete.isPending} onClick={() => { complete.mutate(); }}><CheckCircle2 size={16} />Complete session</button>{complete.isError ? <p role="alert" className="field-error">{complete.error.message}</p> : null}
        <div className="certificate-section"><h2>Certificate</h2>{text(session,'finalStatus')==='pass' ? <><button className="button secondary full-width" type="button" onClick={() => { setShowCertificateOptions((value) => !value); }}><FileDown size={16} />{showCertificateOptions ? 'Hide options' : 'Download certificate'}</button>{showCertificateOptions ? <div className="form-grid"><label>Signature<input type="file" accept="image/*" onChange={(event) => { void uploadSignature(event.target.files?.[0] ?? null); }} /></label><label>Date on signature<select value={signatureDateMode} onChange={(event) => { setSignatureDateMode(event.target.value as 'calibration' | 'current' | 'custom'); }}><option value="calibration">Calibration date</option><option value="current">Current date</option><option value="custom">Custom date</option></select></label>{signatureDateMode==='custom' ? <label>Custom signature date<input type="date" value={customSignatureDate} onChange={(event) => { setCustomSignatureDate(event.target.value); }} /></label> : null}{certificateError ? <p role="alert" className="field-error">{certificateError}</p> : null}<button className="button primary full-width" type="button" disabled={isDownloadingCertificate} onClick={() => { void downloadCertificate(); }}><FileDown size={16} />{isDownloadingCertificate ? 'Generating...' : 'Generate and download PDF'}</button></div> : null}</> : <button className="button secondary full-width" disabled><FileDown size={16} />Complete and pass session to download</button>}</div>
        {isExecutive ? <div className="executive-section"><h2>Executive metadata</h2>{['deviceIp','entryLocation','startTime','endTime'].map((key) => <p key={key}><span>{key}</span> {text(session,key) || 'Not captured'}</p>)}</div> : null}
      </aside>
    </div>
  </>;
}