'use client';

import { Save } from 'lucide-react';
import type { KeyboardEvent,ClipboardEvent } from 'react';
import type { Row } from '@/schemas/resources';
import { text } from '@/features/shared/api';
import { useReadings } from './use-readings';

export function ReadingGrid({ sessionId,lot,readings,isReadOnly }: { sessionId: string; lot: Row; readings: Row[]; isReadOnly: boolean }) {
  const { form,save } = useReadings(sessionId,text(lot,'lotNo'),readings.map((reading) => text(reading,'massG')));
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const values = event.clipboardData.getData('text').trim().split(/[\s,;]+/);
    if (values.length!==10) return;
    event.preventDefault(); values.forEach((value,index) => { form.setValue(`masses.${index}`,value,{ shouldDirty: true }); });
  };
  const advance = (event: KeyboardEvent<HTMLInputElement>,index: number) => {
    if (event.key==='Enter') { event.preventDefault(); form.setFocus(`masses.${(index+1)%10}`); }
  };
  return <form data-unsaved={form.formState.isDirty ? 'true' : 'false'} onSubmit={(event) => { void form.handleSubmit((data) => { save.mutate(data); })(event); }}><div className="section-heading"><h2>Lot {text(lot,'lotNo')}<span className="muted"> · {text(lot,'nominalVolumeUl')} uL{text(lot,'channelNo') ? ` · Channel ${text(lot,'channelNo')}` : ''}</span></h2><span className="save-state" role="status">{save.isPending ? 'Saving...' : form.formState.isDirty ? 'Unsaved changes' : readings.length===10 ? 'Saved' : 'Awaiting readings'}</span></div>
    <table className="data-table reading-table"><thead><tr><th>Reading</th><th>Mass (g)</th><th>Actual volume (uL)</th></tr></thead><tbody>{Array.from({ length: 10 },(_,index) => <tr key={index}><td>{String(index+1).padStart(2,'0')}</td><td><input aria-label={`Mass reading ${index+1}`} inputMode="decimal" disabled={isReadOnly} {...form.register(`masses.${index}`)} onPaste={paste} onKeyDown={(event) => { advance(event,index); }} />{form.formState.errors.masses?.[index]?.message ? <span className="field-error">{form.formState.errors.masses[index].message}</span> : null}</td><td className="numeric">{text(readings[index],'volumeUl') || '-'}</td></tr>)}</tbody></table>
    {save.isError ? <p role="alert" className="field-error">{save.error.message}</p> : null}<div className="form-actions"><button className="button primary" type="submit" disabled={isReadOnly || save.isPending}><Save size={16} />Save lot</button></div>
  </form>;
}