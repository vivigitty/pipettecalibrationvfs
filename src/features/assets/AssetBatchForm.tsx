'use client';

import { Controller,useFieldArray,useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus,Save,Trash2,X } from 'lucide-react';
import { z } from 'zod';
import { EntityPicker } from '@/components/ui/EntityPicker';
import { assetBatchSchema } from '@/schemas/resources';
import { api } from '@/features/shared/api';
import { ResourceForm } from '@/features/shared/ResourceForm';

const blank = () => ({ customerId: '',rangeThresholdId: '',serialNumber: '',inventoryNumber: '',customerAssetId: '',invoiceNumber: '',calibrationValidityMonths: 12 });

export function AssetBatchForm({ isReadOnly,onClose }: { isReadOnly: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [quickCreate,setQuickCreate] = useState<{ resource: 'customers' | 'ranges'; fieldName: `assets.${number}.customerId` | `assets.${number}.rangeThresholdId` } | null>(null);
  const form = useForm<z.input<typeof assetBatchSchema>,unknown,z.output<typeof assetBatchSchema>>({ resolver: zodResolver(assetBatchSchema),defaultValues: { assets: [blank()] } });
  const array = useFieldArray({ control: form.control,name: 'assets' });
  const save = useMutation({ mutationFn: (data: z.output<typeof assetBatchSchema>) => api('assets','POST',data),onSuccess: async () => { await client.invalidateQueries({ queryKey: ['assets'] }); onClose(); } });
  return <section className="form-section"><div className="section-heading"><h2>Register pipettes</h2><button className="icon-button" title="Close" aria-label="Close registration" onClick={onClose}><X size={18} /></button></div>
    {quickCreate ? <ResourceForm resource={quickCreate.resource} isReadOnly={isReadOnly} onClose={() => { setQuickCreate(null); }} onSaved={(row) => {
      const id = typeof row.id==='string' ? row.id : '';
      if (!id) return;
      form.setValue(quickCreate.fieldName,id);
      setQuickCreate(null);
    }} /> : null}
    <form onSubmit={(event) => { void form.handleSubmit((data) => { save.mutate(data); })(event); }}>{array.fields.map((row,index) => <div className="batch-row" key={row.id}><div className="section-heading"><h3>Pipette {index+1}</h3><button type="button" className="icon-button" title="Remove pipette" aria-label={`Remove pipette ${index+1}`} disabled={array.fields.length===1} onClick={() => { array.remove(index); }}><Trash2 size={16} /></button></div><div className="form-grid">
      <Controller name={`assets.${index}.customerId`} control={form.control} render={({ field }) => <EntityPicker resource="customers" label="Customer / department" value={field.value} onChange={field.onChange} onCreateRequest={() => { setQuickCreate({ resource: 'customers',fieldName: `assets.${index}.customerId` }); }} createLabel="Add customer" />} />
      <Controller name={`assets.${index}.rangeThresholdId`} control={form.control} render={({ field }) => <EntityPicker resource="ranges" label="Range configuration" value={field.value} onChange={field.onChange} onCreateRequest={() => { setQuickCreate({ resource: 'ranges',fieldName: `assets.${index}.rangeThresholdId` }); }} createLabel="Add range configuration" />} />
      {(['inventoryNumber','serialNumber','invoiceNumber','customerAssetId'] as const).map((key) => <label key={key}>{({ inventoryNumber: 'Inventory number',serialNumber: 'Serial number',invoiceNumber: 'Invoice number (optional)',customerAssetId: 'Customer asset ID (optional)' })[key]}<input required={key!=='customerAssetId' && key!=='invoiceNumber'} {...form.register(`assets.${index}.${key}`)} />{form.formState.errors.assets?.[index]?.[key]?.message ? <span className="field-error">{form.formState.errors.assets[index][key].message}</span> : null}</label>)}
      <label>Calibration validity (months)<input type="number" min="1" max="60" required {...form.register(`assets.${index}.calibrationValidityMonths`)} /><span className="muted">Sets the next calibration due date when calibration starts.</span>{form.formState.errors.assets?.[index]?.calibrationValidityMonths?.message ? <span className="field-error">{form.formState.errors.assets[index].calibrationValidityMonths.message}</span> : null}</label>
    </div></div>)}
      {save.isError ? <p role="alert" className="field-error">{save.error.message}</p> : null}<div className="form-actions"><button type="button" className="button secondary" disabled={array.fields.length>=50} onClick={() => { array.append(blank()); }}><Plus size={16} />Add pipette</button><button type="submit" className="button primary" disabled={isReadOnly || save.isPending}><Save size={16} />{save.isPending ? 'Saving...' : `Register ${array.fields.length} pipette${array.fields.length>1 ? 's' : ''}`}</button></div>
    </form>
  </section>;
}