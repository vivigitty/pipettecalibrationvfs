'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { useForm,Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Play,Plus } from 'lucide-react';
import { EntityPicker } from '@/components/ui/EntityPicker';
import { api,text } from '@/features/shared/api';
import { rowSchema,startSessionSchema,damageSchema,type Row } from '@/schemas/resources';
import { ResourceForm } from '@/features/shared/ResourceForm';
import { LabConditionsSummary } from '@/features/calibration/LabConditionsSummary';
import { DamageForm } from './DamageForm';

type ObservationDecision = 'undecided' | 'none' | 'add';

/**
 * Pre-calibration checklist for one pipette: confirm or change the environmental condition, who serviced it,
 * and the lab observations (captured inline as damage & replacement records) before the session starts.
 */
export function StartCalibrationForm({ asset,defaultServicedBy,isReadOnly,canManageInstruments }: { asset: Row; defaultServicedBy: string; isReadOnly: boolean; canManageInstruments: boolean }) {
  const router = useRouter();
  const client = useQueryClient();
  const assetId = text(asset,'id');
  const [hasLabForm,setHasLabForm] = useState(false);
  const [decision,setDecision] = useState<ObservationDecision>('undecided');
  const [isObservationFormOpen,setIsObservationFormOpen] = useState(true);
  const [observations,setObservations] = useState<Row[]>([]);
  const form = useForm<z.input<typeof startSessionSchema>,unknown,z.output<typeof startSessionSchema>>({ resolver: zodResolver(startSessionSchema),defaultValues: { labDimensionId: text(asset,'assignedLabDimensionId'),oneDispensingPerChannel: false,servicedBy: defaultServicedBy } });
  const labDimensionId = form.watch('labDimensionId');
  const start = useMutation({ mutationFn: (data: z.output<typeof startSessionSchema>) => api(`assets/${assetId}/sessions`,'POST',data),onSuccess: (data) => { router.push(`/calibrations/${text(data,'id')}`); } });
  const observe = useMutation({ mutationFn: (data: z.output<typeof damageSchema>) => api(`assets/${assetId}/damages`,'POST',data),onSuccess: async (saved) => {
    setObservations((current) => [...current,rowSchema.parse(saved)]);
    setIsObservationFormOpen(false);
    await client.invalidateQueries({ queryKey: ['asset',assetId] });
  } });
  const hasObservationAnswer = decision==='none' || (decision==='add' && observations.length>0 && !isObservationFormOpen);
  const canStart = !isReadOnly && !start.isPending && !hasLabForm && hasObservationAnswer;
  const assignedDate = text(asset,'assignedLabDimensionId') ? 'An environmental condition was pre-assigned from the pipette list; keep it, choose another, or add a new one.' : 'Select an environmental condition, or add a new one here before starting calibration.';
  return <section className="form-section"><h2>Start calibration</h2><p className="muted">{assignedDate}</p>
    {hasLabForm ? <ResourceForm resource="lab-dimensions" isReadOnly={isReadOnly} canManageInstruments={canManageInstruments} onClose={() => { setHasLabForm(false); }} onSaved={(row) => { form.setValue('labDimensionId',text(row,'id'),{ shouldDirty: true,shouldValidate: true }); }} /> : null}
    <form id="start-calibration-form" onSubmit={(event) => { void form.handleSubmit((data) => { start.mutate(data); })(event); }}>
      <div className="form-grid"><div><Controller name="labDimensionId" control={form.control} render={({ field }) => <EntityPicker resource="lab-dimensions" label="Environmental condition" value={field.value} onChange={field.onChange} onCreateRequest={() => { setHasLabForm(true); }} createLabel="Add environmental condition" />} />{form.formState.errors.labDimensionId?.message ? <span className="field-error">{form.formState.errors.labDimensionId.message}</span> : null}</div>
        <label>Serviced by<input maxLength={120} {...form.register('servicedBy')} /><span className="muted">Defaults to you; change if another engineer performed the service.</span>{form.formState.errors.servicedBy?.message ? <span className="field-error">{form.formState.errors.servicedBy.message}</span> : null}</label></div>
      {labDimensionId ? <LabConditionsSummary id={labDimensionId} /> : null}
    </form>
    <fieldset className="form-grid"><legend>Lab observations</legend><label className="checkbox-field"><input type="radio" name="observationDecision" checked={decision==='none'} onChange={() => { setDecision('none'); }} />No observations to record</label><label className="checkbox-field"><input type="radio" name="observationDecision" checked={decision==='add'} onChange={() => { setDecision('add'); if (!observations.length) setIsObservationFormOpen(true); }} />Add observation</label></fieldset>
    {decision==='add' ? <div className="observation-panel">
      {observations.length ? <h3>Observations for this calibration</h3> : null}
      {observations.map((row) => <div className="damage-row" key={text(row,'id')}><strong>{text(row,'damagedPartName')}</strong><p>{text(row,'observationNotes')}</p>{row.partReplaced===true ? <p className="muted">Part replaced · serial {text(row,'replacedPartSerialNumber')}</p> : null}</div>)}
      {isObservationFormOpen ? <><DamageForm key={observations.length} onSave={(data) => { observe.mutate(data); }} isPending={observe.isPending} error={observe.error?.message ?? ''} />{observations.length ? <button type="button" className="button secondary" onClick={() => { setIsObservationFormOpen(false); }}>Cancel</button> : <p className="muted">Save the observation to continue.</p>}</> : <button type="button" className="button secondary" disabled={isReadOnly} onClick={() => { setIsObservationFormOpen(true); }}><Plus size={15} />Add another observation</button>}
    </div> : null}
    <label className="checkbox-field"><input type="checkbox" form="start-calibration-form" {...form.register('oneDispensingPerChannel')} />One dispensing per channel</label>{start.isError ? <p className="field-error" role="alert">{start.error.message}</p> : null}
    <div className="form-actions"><button type="submit" form="start-calibration-form" className="button primary" disabled={!canStart}><Play size={16} />Start calibration</button></div>
  </section>;
}
