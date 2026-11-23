'use client';

import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { downloadCertificate,readSignatureFile,type SignatureDateMode } from './certificate-download';

/**
 * Signature upload and signature-date choice shared by the single-session and bulk certificate flows,
 * so every certificate is generated with the same options whichever screen issues it.
 */
export function CertificateOptionsForm({ sessionIds,onDone }: { sessionIds: string[]; onDone?: () => void }) {
  const [signatureDataUrl,setSignatureDataUrl] = useState<string | undefined>();
  const [signatureDateMode,setSignatureDateMode] = useState<SignatureDateMode>('calibration');
  const [customSignatureDate,setCustomSignatureDate] = useState('');
  const [error,setError] = useState('');
  const [progress,setProgress] = useState<number | null>(null);
  const isBulk = sessionIds.length>1;
  const generate = async () => {
    if (signatureDateMode==='custom' && !customSignatureDate) { setError('Select a custom signature date'); return; }
    setError('');
    const failures: string[] = [];
    for (const [index,sessionId] of sessionIds.entries()) {
      setProgress(index+1);
      try { await downloadCertificate(sessionId,{ signatureDataUrl,signatureDateMode,customSignatureDate }); }
      catch (caught) { failures.push(caught instanceof Error ? caught.message : 'Certificate download failed'); }
    }
    setProgress(null);
    if (failures.length) { setError(isBulk ? `${failures.length} of ${sessionIds.length} certificates failed: ${failures[0] ?? ''}` : failures[0] ?? ''); return; }
    onDone?.();
  };
  const upload = async (file: File | null) => {
    try { setSignatureDataUrl(file ? await readSignatureFile(file) : undefined); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to read signature file'); }
  };
  return <div className="form-grid certificate-options">
    <label>Signature<input type="file" accept="image/*" onChange={(event) => { void upload(event.target.files?.[0] ?? null); }} /><span className="muted">Leave empty to use the default VFL signature.</span></label>
    <label>Date on signature<select value={signatureDateMode} onChange={(event) => { setSignatureDateMode(event.target.value as SignatureDateMode); }}><option value="calibration">Calibration date</option><option value="current">Current date</option><option value="custom">Custom date</option></select></label>
    {signatureDateMode==='custom' ? <label>Custom signature date<input type="date" value={customSignatureDate} onChange={(event) => { setCustomSignatureDate(event.target.value); }} /></label> : null}
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    <button className="button primary full-width" type="button" disabled={progress!==null || !sessionIds.length} onClick={() => { void generate(); }}><FileDown size={16} />{progress!==null ? `Generating${isBulk ? ` ${progress} of ${sessionIds.length}` : ''}...` : isBulk ? `Generate and download ${sessionIds.length} PDFs` : 'Generate and download PDF'}</button>
  </div>;
}
