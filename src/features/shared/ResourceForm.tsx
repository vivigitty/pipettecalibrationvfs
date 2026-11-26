'use client';

import { Copy,Save,Star,X } from 'lucide-react';
import { useEffect,useState } from 'react';
import { Controller } from 'react-hook-form';
import { EntityPicker } from '@/components/ui/EntityPicker';
import { type InstrumentType,type Resource,type Row,listSchema,rowSchema } from '@/schemas/resources';
import { api,rows,text } from './api';
import { fields,type Field } from './form-fields';
import { useMasterInstruments } from './master-instruments';
import { useResourceForm,zLabel } from './use-resource-form';

export function ResourceForm({ resource,isReadOnly,onClose,initialRow,onSaved,prefillValues,canManageInstruments = true }: { resource: Exclude<Resource,'assets'>; isReadOnly: boolean; onClose: () => void; initialRow?: Row; onSaved?: (row: Row) => void; prefillValues?: Record<string,string>; canManageInstruments?: boolean }) {
  const { form,values,plan,zFactor,hasZInputs,save } = useResourceForm(resource,(saved) => {
    const parsed = saved ? rowSchema.safeParse(saved) : null;
    if (parsed?.success) onSaved?.(parsed.data);
    onClose();
  },initialRow,prefillValues);
  const [quickInstrumentTarget,setQuickInstrumentTarget] = useState<{ fieldName: string; instrumentType: InstrumentType } | null>(null);
  const [copyError,setCopyError] = useState('');
  const isLab = resource==='lab-dimensions';
  const masters = useMasterInstruments(isLab);
  const masterData = masters.query.data;
  useEffect(() => {
    // Measurement devices start from the master equipment; anything already chosen is kept.
    if (!isLab || !masterData) return;
    for (const field of fields['lab-dimensions']) {
      if (!field.instrumentType || form.getValues(field.name)) continue;
      const id = text(masterData.masters.find((row) => text(row,'instrumentType')===field.instrumentType),'id');
      if (id) form.setValue(field.name,id,{ shouldDirty: false });
    }
  },[isLab,masterData,form]);
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
  const renderField = (field: Field) => <div key={field.name} className="field">
      {field.resource ? <Controller name={field.name} control={form.control} render={({ field: controlled }) => <EntityPicker resource={field.resource ?? 'instruments'} label={field.label} value={controlled.value} onChange={controlled.onChange} {...(field.instrumentType ? { instrumentType: field.instrumentType,validOn: values.processDate ?? '' } : {})} {...(resource==='lab-dimensions' && field.resource==='instruments' && field.instrumentType && canManageInstruments ? { onCreateRequest: () => { setQuickInstrumentTarget({ fieldName: field.name,instrumentType: field.instrumentType ?? 'balance' }); },createLabel: `Add ${field.label.toLowerCase()}` } : {})} />} /> : <label>{field.label}{field.isOptional ? <span className="optional"> (optional)</span> : null}
        {field.type==='select' ? <select {...form.register(field.name)}>{field.options?.filter((option) => field.name!=='instrumentType' || !prefillValues?.instrumentType || option===prefillValues.instrumentType).map((option) => <option key={option} value={option}>{option.replaceAll('_',' ')}</option>)}</select> : <input {...form.register(field.name)} required={!field.isOptional} type={field.type==='date' || field.type==='email' ? field.type : 'text'} inputMode={field.type==='decimal' ? 'decimal' : undefined} />}</label>}
      {isLab && field.instrumentType ? <MasterControl field={field} selectedId={values[field.name] ?? ''} masterId={masters.masterId(field.instrumentType)} isPending={masters.assign.isPending} isReadOnly={isReadOnly || !canManageInstruments} onAssign={(id) => { masters.assign.mutate(id); }} /> : null}
      {form.formState.errors[field.name]?.message ? <span className="field-error">{String(form.formState.errors[field.name]?.message)}</span> : null}
    </div>;
  return <section className="form-section"><div className="section-heading"><h2>New {resource==='lab-dimensions' ? 'environmental condition' : resource==='ranges' ? 'range configuration' : resource.slice(0,-1)}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close form" title="Close"><X size={18} /></button></div>
    {resource==='lab-dimensions' ? <p className="muted">Balance, air thermometer and water thermometer are all required and must be calibrated for the calibration date.{!canManageInstruments ? ' Ask an administrator to add any missing instruments.' : ''}</p> : null}
    {quickInstrumentTarget ? <ResourceForm resource="instruments" isReadOnly={isReadOnly} prefillValues={{ instrumentType: quickInstrumentTarget.instrumentType }} onClose={() => { setQuickInstrumentTarget(null); }} onSaved={(row) => {
      const id = text(row,'id');
      if (!id) return;
      form.setValue(quickInstrumentTarget.fieldName,id);
      setQuickInstrumentTarget(null);
    }} /> : null}
    <form onSubmit={(event) => { void form.handleSubmit((draft) => { save.mutate(draft); })(event); }}>{initialRow ? <h3>{text(initialRow,'make')} / {text(initialRow,'model')} · {text(initialRow,'rangeLabel')} uL</h3> : isLab ? <><div className="form-grid">{fields[resource].filter((field) => field.name==='processDate' || field.name==='serviceMode').map(renderField)}</div>
      <fieldset className="form-subsection"><legend>Measurement devices</legend><p className="muted">Pre-filled with the master equipment. Choose another instrument for this condition, or make it the master for all future conditions.</p><div className="form-grid">{fields[resource].filter((field) => field.instrumentType).map(renderField)}</div>{masters.assign.isError ? <p role="alert" className="field-error">{masters.assign.error.message}</p> : null}</fieldset>
      <fieldset className="form-subsection"><legend>Environment condition</legend><div className="form-grid">{fields[resource].filter((field) => field.type==='decimal').map(renderField)}</div></fieldset></> : <div className="form-grid">{fields[resource].map(renderField)}</div>}
      {resource==='ranges' ? <div className="limits-section"><div className="section-heading"><h3>Per-volume limits</h3><button type="button" className="button secondary" onClick={() => void copyLimits()}><Copy size={15} />Copy limits</button></div>
        {plan.isError ? <p className="field-error">{plan.error.message}</p> : <p className="muted">Test points: {plan.data?.timesToTest ?? '-'} · Repeats: {plan.data?.repeats ?? '-'}</p>}
        {!initialRow && plan.data ? (() => {
          const table = values.channel!=='single' ? 'multi-channel' : 'single-channel';
          const manual = plan.data.points.filter((point) => !point.suggested);
          if (!plan.data.limitSource) return <p className="warning-label">This range is not in the {table} limit table. Enter the limits manually.</p>;
          return <><p className="ready-label">Pre-filled from the {table} limit table ({plan.data.limitSource}). Change any value if needed.</p>{manual.length ? <p className="warning-label">Not in the table, enter manually: {manual.map((point) => `${point.volume} uL`).join(', ')}.</p> : null}</>;
        })() : null}
        <div className="limits-grid">{plan.data?.points.map((point) => <div key={point.pct}><h4>{point.volume} uL · {point.pct}%</h4><label>Inaccuracy limit (%)<input required inputMode="decimal" {...form.register(`inaccuracy${point.pct}`)} /></label><label>Imprecision limit (%)<input required inputMode="decimal" {...form.register(`imprecision${point.pct}`)} /></label></div>)}</div>{copyError ? <p role="alert" className="field-error">{copyError}</p> : null}
      </div> : null}
      {resource==='lab-dimensions' ? <div className="resolved-value"><span>Z correction</span><strong>{hasZInputs ? zLabel(zFactor.data) || '----' : '----'}</strong><span>uL/mg</span>{!hasZInputs ? <span className="muted">Enter DD water temperature (15-30 C) and air pressure (800-1050 hPa) to calculate Z.</span> : zFactor.isError ? <span className="field-error">{zFactor.error.message}</span> : null}</div> : null}
      {save.isError ? <p role="alert" className="field-error">{save.error.message}</p> : null}
      <div className="form-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={isReadOnly || save.isPending} type="submit"><Save size={16} />{save.isPending ? 'Saving...' : 'Save record'}</button></div>
    </form>
  </section>;
}

/** Shows whether the chosen instrument is the master for its type and lets the user make it the master. */
function MasterControl({ field,selectedId,masterId,isPending,isReadOnly,onAssign }: { field: Field; selectedId: string; masterId: string; isPending: boolean; isReadOnly: boolean; onAssign: (id: string) => void }) {
  if (!selectedId) return masterId ? null : <span className="muted">No master {field.label.toLowerCase()} assigned yet.</span>;
  if (selectedId===masterId) return <span className="ready-label"><Star size={13} /> Master equipment</span>;
  return <button type="button" className="button secondary inline-picker-action" disabled={isReadOnly || isPending} onClick={() => { onAssign(selectedId); }}><Star size={15} />{isPending ? 'Saving...' : `Make master ${field.label.toLowerCase()}`}</button>;
}
