'use client';

import { useState } from 'react';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { CalendarCheck,X } from 'lucide-react';
import { EntityPicker } from '@/components/ui/EntityPicker';
import { api,text } from '@/features/shared/api';
import { ResourceForm } from '@/features/shared/ResourceForm';
import { LabConditionsSummary } from '@/features/calibration/LabConditionsSummary';

/** Assigns a calibration date and environmental condition to the selected not-started pipettes in one step. */
export function AssetAssignmentPanel({ assetIds,isReadOnly,canManageInstruments,onClose }: { assetIds: string[]; isReadOnly: boolean; canManageInstruments: boolean; onClose: (isAssigned: boolean) => void }) {
  const client = useQueryClient();
  const [calibrationDate,setCalibrationDate] = useState(new Date().toISOString().slice(0,10));
  const [labDimensionId,setLabDimensionId] = useState('');
  const [hasLabForm,setHasLabForm] = useState(false);
  const assign = useMutation({ mutationFn: () => api('assets/assignments','POST',{ assetIds,labDimensionId }),onSuccess: async () => {
    await client.invalidateQueries({ queryKey: ['assets'] });
    onClose(true);
  } });
  return <section className="form-section assignment-panel"><div className="section-heading"><h2>Assign calibration to {assetIds.length} pipette{assetIds.length===1 ? '' : 's'}</h2><button type="button" className="icon-button" title="Close" aria-label="Close assignment" onClick={() => { onClose(false); }}><X size={18} /></button></div>
    <p className="muted">The calibration date and environmental condition (equipment, temperatures, humidity and pressure) are pre-filled when each pipette's calibration is started. They can still be changed per pipette.</p>
    <div className="form-grid">
      <label>Calibration date<input type="date" value={calibrationDate} onChange={(event) => { setCalibrationDate(event.target.value); setLabDimensionId(''); }} /></label>
      <EntityPicker resource="lab-dimensions" label="Environmental condition" value={labDimensionId} onChange={setLabDimensionId} processDate={calibrationDate} onCreateRequest={() => { setHasLabForm(true); }} createLabel="Add environmental condition" />
    </div>
    {hasLabForm ? <ResourceForm resource="lab-dimensions" isReadOnly={isReadOnly} canManageInstruments={canManageInstruments} prefillValues={{ processDate: calibrationDate }} onClose={() => { setHasLabForm(false); }} onSaved={(row) => {
      const savedDate = text(row,'processDate').slice(0,10);
      if (savedDate) setCalibrationDate(savedDate);
      setLabDimensionId(text(row,'id'));
    }} /> : null}
    {labDimensionId ? <LabConditionsSummary id={labDimensionId} /> : null}
    {assign.isError ? <p role="alert" className="field-error">{assign.error.message}</p> : null}
    <div className="form-actions"><button type="button" className="button secondary" onClick={() => { onClose(false); }}>Cancel</button><button type="button" className="button primary" disabled={isReadOnly || !labDimensionId || !assetIds.length || assign.isPending} onClick={() => { assign.mutate(); }}><CalendarCheck size={16} />{assign.isPending ? 'Assigning...' : `Assign to ${assetIds.length} pipette${assetIds.length===1 ? '' : 's'}`}</button></div>
  </section>;
}
