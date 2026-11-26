import { z } from 'zod';

export type SignatureDateMode = 'calibration' | 'current' | 'custom';
export type SignatureMode = 'default' | 'upload' | 'none';
export type CertificateOptions = { signatureMode: SignatureMode; signatureDataUrl: string | undefined; signatureDateMode: SignatureDateMode; customSignatureDate: string };

const problemSchema = z.object({ detail: z.string(),requestId: z.string().optional() });

/** Generates one certificate with the chosen signature options and saves it via a temporary link. */
export async function downloadCertificate(sessionId: string, options: CertificateOptions) {
  const response = await fetch(`/api/v1/sessions/${sessionId}/certificate-download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signatureMode: options.signatureMode,signatureDataUrl: options.signatureMode==='upload' ? options.signatureDataUrl : undefined,signatureDateMode: options.signatureDateMode,customSignatureDate: options.signatureDateMode==='custom' ? options.customSignatureDate : undefined }),
  });
  if (!response.ok) {
    const problem = problemSchema.safeParse(await response.json().catch(() => null));
    throw new Error(problem.success ? `${problem.data.detail}${problem.data.requestId ? ` (Request ID: ${problem.data.requestId})` : ''}` : 'Certificate download failed');
  }
  const blob = await response.blob();
  const fallback = `certificate_${sessionId}.pdf`;
  const filename = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/i)?.[1]?.trim() || fallback;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function readSignatureFile(file: File) {
  return new Promise<string>((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(typeof reader.result==='string' ? reader.result : ''); };
    reader.onerror = () => { reject(new Error('Unable to read signature file')); };
    reader.readAsDataURL(file);
  });
}
