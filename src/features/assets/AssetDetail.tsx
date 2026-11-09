'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { useForm,Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft,Play,Plus } from 'lucide-react';
import { EntityPicker } from '@/components/ui/EntityPicker';
import { Status } from '@/components/ui/Status';
import { api,text } from '@/features/shared/api';
import { rowSchema,startSessionSchema,damageSchema } from '@/schemas/resources';
import { DamageForm } from './DamageForm';

const detailSchema = z.object({ asset: rowSchema,sessions: z.array(rowSchema),damages: z.array(rowSchema) });

export function AssetDetail({ id,isReadOnly }: { id: string; isReadOnly: boolean }) {
  const router = useRouter();
  const client = useQueryClient();
  const [hasDamageForm,setHasDamageForm] = useState(false);
  const query = useQuery({ queryKey: ['asset',id],queryFn: async () => detailSchema.parse(await api(`assets/${id}`)) });
  const form = useForm<z.input<typeof startSessionSchema>,unknown,z.output<typeof startSessionSchema>>({ resolver: zodResolver(startSessionSchema),defaultValues: { labDimensionId: '',nextCalibrationMonths: 12,oneDispensingPerChannel: false } });
  const start = useMutation({ mutationFn: (data: z.output<typeof startSessionSchema>) => api(`assets/${id}/sessions`,'POST',data),onSuccess: (data) => { router.push(`/calibrations/${text(data,'id')}`); } });
  const damage = useMutation({ mutationFn: (data: z.output<typeof damageSchema>) => api(`assets/${id}/damages`,'POST',data),onSuccess: async () => { await client.invalidateQueries({ queryKey: ['asset',id] }); setHasDamageForm(false); } });
  if (query.isPending) return <p role="status">Loading pipette...</p>;
  if (query.isError) return <p role="alert" className="field-error">{query.error.message}</p>;
  const { asset,sessions,damages } = query.data;
  return <><Link className="back-link" href="/assets"><ArrowLeft size={15} />Pipette inventory</Link><div className="page-heading"><div><div className="eyebrow">Inventory no.</div><h1>{text(asset,'inventoryNumber')}</h1></div><Status value={text(asset,'progress')} /></div>
    <dl className="asset-facts">{[['serialNumber','Serial number'],['invoiceNumber','Invoice number'],['customerAssetId','Customer asset ID']].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{text(asset,key ?? '') || 'Nil'}</dd></div>)}</dl>
    <section className="form-section"><h2>Start calibration</h2><form onSubmit={(event) => { void form.handleSubmit((data) => { start.mutate(data); })(event); }}><div className="form-grid"><Controller name="labDimensionId" control={form.control} render={({ field }) => <EntityPicker resource="lab-dimensions" label="Lab sitting" value={field.value} onChange={field.onChange} />} /><label>Next calibration due (months)<input type="number" min="1" max="60" {...form.register('nextCalibrationMonths')} /></label></div><label className="checkbox-field"><input type="checkbox" {...form.register('oneDispensingPerChannel')} />One dispensing per channel</label>{start.isError ? <p className="field-error" role="alert">{start.error.message}</p> : null}<div className="form-actions"><Link href="/lab-dimensions?new=1" className="button secondary">New lab sitting</Link><button type="submit" className="button primary" disabled={isReadOnly || start.isPending}><Play size={16} />Start calibration</button></div></form></section>
    <section className="register-section"><div className="register-top"><h2>Calibration sessions</h2></div>{sessions.length ? <table className="data-table"><thead><tr><th>Session</th><th>Status</th><th>Result</th><th>Next due</th></tr></thead><tbody>{sessions.map((session) => <tr key={text(session,'id')}><td><Link href={`/calibrations/${text(session,'id')}`}>Session {text(session,'sessionNo')}</Link></td><td><Status value={text(session,'status')} /></td><td><Status value={text(session,'finalStatus')} /></td><td>{text(session,'dueDate').slice(0,10)}</td></tr>)}</tbody></table> : <p className="section-empty">No calibration sessions yet</p>}</section>
    <section className="register-section"><div className="register-top"><h2>Damage & replacement records</h2><button className="button secondary" disabled={isReadOnly} onClick={() => { setHasDamageForm(true); }}><Plus size={15} />Add observation</button></div>{damages.length ? damages.map((row) => <div className="damage-row" key={text(row,'id')}><strong>{text(row,'damagedPartName')}</strong><p>{text(row,'observationNotes')}</p></div>) : <p className="section-empty">No damage recorded</p>}{hasDamageForm ? <DamageForm onSave={(data) => { damage.mutate(data); }} isPending={damage.isPending} error={damage.error?.message ?? ''} /> : null}</section>
  </>;
}