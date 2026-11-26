'use client';

import { useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { z } from 'zod';
import { api } from '@/features/shared/api';
import { downloadCertificate,readSignatureFile,type SignatureDateMode,type SignatureMode } from './certificate-download';

const mySignatureSchema = z.object({ hasSignature: z.boolean(),imageDataUrl: z.string().nullable() });

/**
 * Signature and signature-date choice shared by the single-session and bulk certificate flows,
 * so every certificate is generated with the same options whichever screen issues it.
 * The default signature is the one saved for the signed-in user, falling back to the company signature.
 */
export function CertificateOptionsForm({ sessionIds,onDone }: { sessionIds: string[]; onDone?: () => void }) {
  const client = useQueryClient();
  const [signatureMode,setSignatureMode] = useState<SignatureMode>('default');
  const [signatureDataUrl,setSignatureDataUrl] = useState<string | undefined>();
  const [shouldSaveAsDefault,setShouldSaveAsDefault] = useState(true);
  const [signatureDateMode,setSignatureDateMode] = useState<SignatureDateMode>('calibration');
  const [customSignatureDate,setCustomSignatureDate] = useState('');
  const [error,setError] = useState('');
  const [progress,setProgress] = useState<number | null>(null);
  const mine = useQuery({ queryKey: ['me','signature'],queryFn: async () => mySignatureSchema.parse(await api('me/signature')) });
  const saveDefault = useMutation({ mutationFn: (imageDataUrl: string) => api('me/signature','PUT',{ imageDataUrl }),onSuccess: () => client.invalidateQueries({ queryKey: ['me','signature'] }) });
  const isBulk = sessionIds.length>1;
  const hasSignature = signatureMode!=='none';
  const generate = async () => {
    if (signatureMode==='upload' && !signatureDataUrl) { setError('Choose a signature image to upload'); return; }
    if (hasSignature && signatureDateMode==='custom' && !customSignatureDate) { setError('Select a custom signature date'); return; }
    setError('');
    if (signatureMode==='upload' && signatureDataUrl && shouldSaveAsDefault) {
      try { await saveDefault.mutateAsync(signatureDataUrl); }
      catch (caught) { setError(caught instanceof Error ? `Signature not saved as default: ${caught.message}` : 'Signature not saved as default'); return; }
    }
    const failures: string[] = [];
    for (const [index,sessionId] of sessionIds.entries()) {
      setProgress(index+1);
      try { await downloadCertificate(sessionId,{ signatureMode,signatureDataUrl,signatureDateMode,customSignatureDate }); }
      catch (caught) { failures.push(caught instanceof Error ? caught.message : 'Certificate download failed'); }
    }
    setProgress(null);
    if (failures.length) { setError(isBulk ? `${failures.length} of ${sessionIds.length} certificates failed: ${failures[0] ?? ''}` : failures[0] ?? ''); return; }
    onDone?.();
  };
  const upload = async (file: File | null) => {
    try { setSignatureDataUrl(file ? await readSignatureFile(file) : undefined); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to read signature file'); }
  };
  const defaultHint = mine.isPending ? 'Checking for your saved signature...' : mine.data?.hasSignature ? 'Uses the signature saved for your login.' : 'No signature is saved for your login yet, so the company signature is used. Upload one to make it your default.';
  return <div className="form-grid certificate-options">
    <label>Signature<select value={signatureMode} onChange={(event) => { setSignatureMode(event.target.value as SignatureMode); setError(''); }}><option value="default">{mine.data?.hasSignature ? 'My saved signature' : 'Default signature'}</option><option value="upload">Upload a signature</option><option value="none">No Sign/Date</option></select>
      <span className="muted">{signatureMode==='default' ? defaultHint : signatureMode==='none' ? 'The PDF is printed without a signature or signature date.' : 'The uploaded image is used for these certificates.'}</span></label>
    {signatureMode==='default' && mine.data?.imageDataUrl ? <div className="signature-preview"><img src={mine.data.imageDataUrl} alt="Your saved signature" /></div> : null}
    {signatureMode==='upload' ? <><label>Signature image<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => { void upload(event.target.files?.[0] ?? null); }} /></label>
      <label className="checkbox-field"><input type="checkbox" checked={shouldSaveAsDefault} onChange={(event) => { setShouldSaveAsDefault(event.target.checked); }} />Save as my default signature</label></> : null}
    {hasSignature ? <label>Date on signature<select value={signatureDateMode} onChange={(event) => { setSignatureDateMode(event.target.value as SignatureDateMode); }}><option value="calibration">Calibration date</option><option value="current">Current date</option><option value="custom">Custom date</option></select></label> : null}
    {hasSignature && signatureDateMode==='custom' ? <label>Custom signature date<input type="date" value={customSignatureDate} onChange={(event) => { setCustomSignatureDate(event.target.value); }} /></label> : null}
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    <button className="button primary full-width" type="button" disabled={progress!==null || saveDefault.isPending || !sessionIds.length} onClick={() => { void generate(); }}><FileDown size={16} />{progress!==null ? `Generating${isBulk ? ` ${progress} of ${sessionIds.length}` : ''}...` : isBulk ? `Generate and download ${sessionIds.length} PDFs` : 'Generate and download PDF'}</button>
  </div>;
}
