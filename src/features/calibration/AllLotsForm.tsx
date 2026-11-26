'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { Calculator } from 'lucide-react';
import type { ClipboardEvent,KeyboardEvent } from 'react';
import { decimalSchema,type Row } from '@/schemas/resources';
import { api,rows,text } from '@/features/shared/api';

const READINGS = 10;
type Draft = { lots: { masses: string[] }[] };

/** Every lot of the session on one page; one save stores all readings and recalculates the errors. */
export function AllLotsForm({ sessionId,lots,isReadOnly,channelCount = 1 }: { sessionId: string; lots: Row[]; isReadOnly: boolean; channelCount?: number }) {
  const client = useQueryClient();
  const initial = (): Draft => ({ lots: lots.map((lot) => { const saved = rows(lot.readings); return { masses: Array.from({ length: READINGS },(_,index) => text(saved[index],'massG')) }; }) });
  const form = useForm<Draft>({ defaultValues: initial() });
  const save = useMutation({ mutationFn: (payload: { lots: { lotNo: number; masses: string[] }[] }) => api(`sessions/${sessionId}/lots`,'PATCH',payload),onSuccess: async () => {
    form.reset(form.getValues());
    await client.invalidateQueries({ queryKey: ['session',sessionId] });
  } });
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (isDirty) event.preventDefault(); };
    window.addEventListener('beforeunload',warn);
    return () => { window.removeEventListener('beforeunload',warn); };
  },[isDirty]);
  const submit = (draft: Draft) => {
    form.clearErrors();
    const payload: { lotNo: number; masses: string[] }[] = [];
    const errors: { lotIndex: number; index: number; message: string }[] = [];
    draft.lots.forEach((entry,lotIndex) => {
      const masses = entry.masses.map((value) => value.trim());
      if (masses.every((value) => !value)) return;
      masses.forEach((value,index) => {
        const result = decimalSchema.safeParse(value);
        if (!result.success) errors.push({ lotIndex,index,message: value ? result.error.issues[0]?.message ?? 'Invalid mass' : 'Required' });
      });
      payload.push({ lotNo: Number(text(lots[lotIndex],'lotNo')),masses });
    });
    for (const error of errors) form.setError(`lots.${error.lotIndex}.masses.${error.index}`,{ message: error.message });
    if (errors.length) return;
    if (!payload.length) { form.setError('root',{ message: 'Enter readings for at least one lot' }); return; }
    save.mutate({ lots: payload });
  };
  const paste = (event: ClipboardEvent<HTMLInputElement>,lotIndex: number) => {
    const values = event.clipboardData.getData('text').trim().split(/[\s,;]+/);
    if (values.length!==READINGS) return;
    event.preventDefault();
    values.forEach((value,index) => { form.setValue(`lots.${lotIndex}.masses.${index}`,value,{ shouldDirty: true }); });
  };
  const advance = (event: KeyboardEvent<HTMLInputElement>,lotIndex: number,index: number) => {
    if (event.key!=='Enter') return;
    event.preventDefault();
    const isLast = index===READINGS-1;
    form.setFocus(`lots.${isLast ? (lotIndex+1)%lots.length : lotIndex}.masses.${isLast ? 0 : index+1}`);
  };
  const status = save.isPending ? 'Saving and calculating...' : isDirty ? 'Unsaved changes' : lots.every((lot) => rows(lot.readings).length===READINGS) ? 'All lots saved' : 'Awaiting readings';
  return <form data-unsaved={isDirty ? 'true' : 'false'} onSubmit={(event) => { void form.handleSubmit(submit)(event); }}>
    <div className="section-heading"><h2>Readings <span className="muted">· {lots.length} lot{lots.length===1 ? '' : 's'}</span></h2><span className="save-state" role="status">{status}</span></div>
    <p className="muted">Enter all lots, then save once. Paste ten values into the first cell of a lot to fill it.</p>
    <div className="lots-grid">{lots.map((lot,lotIndex) => <section className="lot-card" key={text(lot,'id')} aria-label={`Lot ${text(lot,'lotNo')}`}>
      <h3>Lot {text(lot,'lotNo')}<span className="muted"> · {text(lot,'nominalVolumeUl')} uL{channelCount>1 && !text(lot,'channelNo') ? ` × ${channelCount}` : ''}{text(lot,'channelNo') ? ` · Ch ${text(lot,'channelNo')}` : ''}</span></h3>
      <table className="data-table reading-table"><thead><tr><th>#</th><th>Mass (g)</th><th>Volume (uL)</th></tr></thead><tbody>{Array.from({ length: READINGS },(_,index) => {
        const fieldError = form.formState.errors.lots?.[lotIndex]?.masses?.[index]?.message;
        return <tr key={index}><td>{String(index+1).padStart(2,'0')}</td><td><input aria-label={`Lot ${text(lot,'lotNo')} mass reading ${index+1}`} inputMode="decimal" disabled={isReadOnly} {...form.register(`lots.${lotIndex}.masses.${index}`)} onPaste={(event) => { paste(event,lotIndex); }} onKeyDown={(event) => { advance(event,lotIndex,index); }} />{fieldError ? <span className="field-error">{fieldError}</span> : null}</td><td className="numeric">{text(rows(lot.readings)[index],'volumeUl').slice(0,10) || '-'}</td></tr>;
      })}</tbody></table>
    </section>)}</div>
    {form.formState.errors.root?.message ? <p role="alert" className="field-error">{form.formState.errors.root.message}</p> : null}
    {save.isError ? <p role="alert" className="field-error">{save.error.message}</p> : null}
    <div className="form-actions"><button className="button primary" type="submit" disabled={isReadOnly || save.isPending}><Calculator size={16} />{save.isPending ? 'Saving...' : 'Save all lots & calculate errors'}</button></div>
  </form>;
}
