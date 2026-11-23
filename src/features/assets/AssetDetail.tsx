'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ArrowLeft,Plus } from 'lucide-react';
import { Status } from '@/components/ui/Status';
import { api,text } from '@/features/shared/api';
import { rowSchema,damageSchema } from '@/schemas/resources';
import { DamageForm } from './DamageForm';
import { StartCalibrationForm } from './StartCalibrationForm';

const detailSchema = z.object({ asset: rowSchema,sessions: z.array(rowSchema),damages: z.array(rowSchema) });

export function AssetDetail({ id,defaultServicedBy,isReadOnly,canManageInstruments }: { id: string; defaultServicedBy: string; isReadOnly: boolean; canManageInstruments: boolean }) {
  const client = useQueryClient();
  const [hasDamageForm,setHasDamageForm] = useState(false);
  const query = useQuery({ queryKey: ['asset',id],queryFn: async () => detailSchema.parse(await api(`assets/${id}`)) });
  const damage = useMutation({ mutationFn: (data: z.output<typeof damageSchema>) => api(`assets/${id}/damages`,'POST',data),onSuccess: async () => { await client.invalidateQueries({ queryKey: ['asset',id] }); setHasDamageForm(false); } });
  if (query.isPending) return <p role="status">Loading pipette...</p>;
  if (query.isError) return <p role="alert" className="field-error">{query.error.message}</p>;
  const { asset,sessions,damages } = query.data;
  const validity = text(asset,'calibrationValidityMonths');
  const facts = [['Serial number',text(asset,'serialNumber')],['Invoice number',text(asset,'invoiceNumber')],['Customer asset ID',text(asset,'customerAssetId')],['Calibration validity',validity ? `${validity} months` : '']];
  const canStartSession = text(asset,'progress')!=='in_progress';
  return <><Link className="back-link" href="/assets"><ArrowLeft size={15} />Pipette inventory</Link><div className="page-heading"><div><div className="eyebrow">Inventory no.</div><h1>{text(asset,'inventoryNumber')}</h1></div><Status value={text(asset,'progress')} /></div>
    <dl className="asset-facts">{facts.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Nil'}</dd></div>)}</dl>
    {canStartSession ? <StartCalibrationForm asset={asset} defaultServicedBy={defaultServicedBy} isReadOnly={isReadOnly} canManageInstruments={canManageInstruments} /> : null}
    <section className="register-section"><div className="register-top"><h2>Calibration sessions</h2></div>{sessions.length ? <table className="data-table"><thead><tr><th>Session</th><th>Status</th><th>Result</th><th>Next due</th></tr></thead><tbody>{sessions.map((session) => <tr key={text(session,'id')}><td><Link href={`/calibrations/${text(session,'id')}`}>Session {text(session,'sessionNo')}</Link></td><td><Status value={text(session,'status')} /></td><td><Status value={text(session,'finalStatus')} /></td><td>{text(session,'dueDate').slice(0,10)}</td></tr>)}</tbody></table> : <p className="section-empty">No calibration sessions yet</p>}</section>
    <section className="register-section"><div className="register-top"><h2>Damage & replacement records</h2><button className="button secondary" disabled={isReadOnly} onClick={() => { setHasDamageForm(true); }}><Plus size={15} />Add observation</button></div>{damages.length ? damages.map((row) => <div className="damage-row" key={text(row,'id')}><strong>{text(row,'damagedPartName')}</strong><p>{text(row,'observationNotes')}</p></div>) : <p className="section-empty">No damage recorded</p>}{hasDamageForm ? <DamageForm onSave={(data) => { damage.mutate(data); }} isPending={damage.isPending} error={damage.error?.message ?? ''} /> : null}</section>
  </>;
}
