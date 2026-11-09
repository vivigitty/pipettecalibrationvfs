'use client';

import { Copy,Save,X } from 'lucide-react';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { EntityPicker } from '@/components/ui/EntityPicker';
import { type Resource,type Row,listSchema } from '@/schemas/resources';
import { api,rows,text } from './api';
import { fields } from './form-fields';
import { useResourceForm,zLabel } from './use-resource-form';

export function ResourceForm({ resource,isReadOnly,onClose,initialRow }: { resource: Exclude<Resource,'assets'>; isReadOnly: boolean; onClose: () => void; initialRow?: Row }) {
  const { form,values,plan,zFactor,save } = useResourceForm(resource,onClose,initialRow);
  const [copyError,setCopyError] = useState('');
  const copyLimits = async () => {
    try {
      const list = listSchema.parse(await api(`ranges?search=${encodeURIComponent(values.rangeLabel ?? '')}`));
      const source = list.data.find((row) => text(row,'rangeLabel')===values.rangeLabel && rows(row.limits).length>0);
      if (!source) { setCopyError('No configuration with limits found for this range'); return; }
      for (const limit of rows(source.limits)) {
        form.setValue(`inaccuracy${text(limit,'testPointPct')}`,text(limit,'inaccuracyLimitPct'));
        form.setValue(`imprecision${text(limit,'testPointPct')}`,text(limit,'imprecisionLimitPct'));
      }
      setCopyError('');
    } catch (error) { setCopyError(error instanceof Error ? error.message : 'Could not copy limits'); }
  };
  return <section className="form-section"><div className="section-heading"><h2>New {resource==='lab-dimensions' ? 'lab sitting' : resource==='ranges' ? 'range configuration' : resource.slice(0,-1)}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close form" title="Close"><X size={18} /></button></div>
    <form onSubmit={(event) => { void form.handleSubmit((draft) => { save.mutate(draft); })(event); }}>{initialRow ? <h3>{text(initialRow,'make')} / {text(initialRow,'model')} · {text(initialRow,'rangeLabel')} uL</h3> : <div className="form-grid">{fields[resource].map((field) => <div key={field.name} className="field">
      {field.resource ? <Controller name={field.name} control={form.control} render={({ field: controlled }) => <EntityPicker resource={field.resource ?? 'instruments'} label={field.label} value={controlled.value} onChange={controlled.onChange} filter={(row) => !field.instrumentType || (text(row,'instrumentType')===field.instrumentType && text(row,'calibrationDueDate').slice(0,10)>=(values.processDate ?? ''))} />} /> : <label>{field.label}{field.isOptional ? <span className="optional"> (optional)</span> : null}
        {field.type==='select' ? <select {...form.register(field.name)}>{field.options?.map((option) => <option key={option} value={option}>{option.replaceAll('_',' ')}</option>)}</select> : <input {...form.register(field.name)} required={!field.isOptional} type={field.type==='date' || field.type==='email' ? field.type : 'text'} inputMode={field.type==='decimal' ? 'decimal' : undefined} />}</label>}
      {form.formState.errors[field.name]?.message ? <span className="field-error">{String(form.formState.errors[field.name]?.message)}</span> : null}
    </div>)}</div>}
      {resource==='ranges' ? <div className="limits-section"><div className="section-heading"><h3>Per-volume limits</h3><button type="button" className="button secondary" onClick={() => void copyLimits()}><Copy size={15} />Copy limits</button></div>
        {plan.isError ? <p className="field-error">{plan.error.message}</p> : <p className="muted">Test points: {plan.data?.timesToTest ?? '-'} · Repeats: {plan.data?.repeats ?? '-'}</p>}
        <div className="limits-grid">{plan.data?.points.map((point) => <div key={point.pct}><h4>{point.volume} uL · {point.pct}%</h4><label>Inaccuracy limit (%)<input required inputMode="decimal" {...form.register(`inaccuracy${point.pct}`)} /></label><label>Imprecision limit (%)<input required inputMode="decimal" {...form.register(`imprecision${point.pct}`)} /></label></div>)}</div>{copyError ? <p role="alert" className="field-error">{copyError}</p> : null}
      </div> : null}
      {resource==='lab-dimensions' ? <div className="resolved-value"><span>Z correction</span><strong>{zLabel(zFactor.data) || '----'}</strong><span>uL/mg</span>{zFactor.isError ? <span className="field-error">{zFactor.error.message}</span> : null}</div> : null}
      {save.isError ? <p role="alert" className="field-error">{save.error.message}</p> : null}
      <div className="form-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={isReadOnly || save.isPending} type="submit"><Save size={16} />{save.isPending ? 'Saving...' : 'Save record'}</button></div>
    </form>
  </section>;
}