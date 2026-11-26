'use client';

import { useState } from 'react';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { CalendarCheck,RotateCcw,X } from 'lucide-react';
import { api } from '@/features/shared/api';

const plural = (count: number) => `${count} pipette${count===1 ? '' : 's'}`;

/** Assigns the calibration validity (months to the next due date) to the selected pipettes in one step. */
export function AssetValidityPanel({ assetIds,isReadOnly,onClose }: { assetIds: string[]; isReadOnly: boolean; onClose: (isSaved: boolean) => void }) {
  const client = useQueryClient();
  const [months,setMonths] = useState('12');
  const assign = useMutation({ mutationFn: () => api('assets/validity','POST',{ assetIds,calibrationValidityMonths: Number(months) }),onSuccess: async () => {
    await client.invalidateQueries({ queryKey: ['assets'] });
    onClose(true);
  } });
  const isValid = /^\d+$/.test(months) && Number(months)>=1 && Number(months)<=60;
  return <section className="form-section assignment-panel"><div className="section-heading"><h2>Assign calibration validity to {plural(assetIds.length)}</h2><button type="button" className="icon-button" title="Close" aria-label="Close validity assignment" onClick={() => { onClose(false); }}><X size={18} /></button></div>
    <p className="muted">The validity sets the next calibration due date (and reminder) when each pipette's calibration is started.</p>
    <div className="form-grid"><label>Calibration validity (months)<input type="number" min="1" max="60" required value={months} onChange={(event) => { setMonths(event.target.value); }} />{!isValid ? <span className="field-error">Enter a whole number of months from 1 to 60</span> : null}</label></div>
    {assign.isError ? <p role="alert" className="field-error">{assign.error.message}</p> : null}
    <div className="form-actions"><button type="button" className="button secondary" onClick={() => { onClose(false); }}>Cancel</button><button type="button" className="button primary" disabled={isReadOnly || !isValid || !assetIds.length || assign.isPending} onClick={() => { assign.mutate(); }}><CalendarCheck size={16} />{assign.isPending ? 'Assigning...' : `Assign to ${plural(assetIds.length)}`}</button></div>
  </section>;
}

/** Re-opens calibrated pipettes (keeping their inventory numbers) as calibration jobs planned for a future date. */
export function RecalibrationPanel({ assetIds,isReadOnly,defaultMonths = '',onClose }: { assetIds: string[]; isReadOnly: boolean; defaultMonths?: string; onClose: (isSaved: boolean) => void }) {
  const client = useQueryClient();
  const today = new Date().toISOString().slice(0,10);
  const [scheduledDate,setScheduledDate] = useState(today);
  const [months,setMonths] = useState(defaultMonths);
  const schedule = useMutation({ mutationFn: () => api('assets/recalibrations','POST',{ assetIds,scheduledDate,...(months ? { calibrationValidityMonths: Number(months) } : {}) }),onSuccess: async () => {
    await client.invalidateQueries({ queryKey: ['assets'] });
    await client.invalidateQueries({ queryKey: ['asset'] });
    onClose(true);
  } });
  const isMonthsValid = !months || (/^\d+$/.test(months) && Number(months)>=1 && Number(months)<=60);
  const isDateValid = Boolean(scheduledDate) && scheduledDate>=today;
  return <section className="form-section assignment-panel"><div className="section-heading"><h2>Schedule re-calibration for {plural(assetIds.length)}</h2><button type="button" className="icon-button" title="Close" aria-label="Close re-calibration" onClick={() => { onClose(false); }}><X size={18} /></button></div>
    <p className="muted">The pipette keeps its inventory number and calibration history, and returns to the calibration jobs as not started for the planned date. Previous certificates stay available.</p>
    <div className="form-grid">
      <label>Planned calibration date<input type="date" min={today} required value={scheduledDate} onChange={(event) => { setScheduledDate(event.target.value); }} />{!isDateValid ? <span className="field-error">Choose today or a future date</span> : null}</label>
      <label>Calibration validity (months)<span className="optional"> (optional)</span><input type="number" min="1" max="60" value={months} placeholder="Keep current" onChange={(event) => { setMonths(event.target.value); }} />{!isMonthsValid ? <span className="field-error">Enter 1 to 60 months, or leave empty</span> : null}</label>
    </div>
    {schedule.isError ? <p role="alert" className="field-error">{schedule.error.message}</p> : null}
    <div className="form-actions"><button type="button" className="button secondary" onClick={() => { onClose(false); }}>Cancel</button><button type="button" className="button primary" disabled={isReadOnly || !isDateValid || !isMonthsValid || !assetIds.length || schedule.isPending} onClick={() => { schedule.mutate(); }}><RotateCcw size={16} />{schedule.isPending ? 'Scheduling...' : `Schedule ${plural(assetIds.length)}`}</button></div>
  </section>;
}
