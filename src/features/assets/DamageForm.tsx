'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { damageSchema } from '@/schemas/resources';

export function DamageForm({ onSave,isPending,error }: { onSave: (data: z.output<typeof damageSchema>) => void; isPending: boolean; error: string }) {
  const form = useForm<z.input<typeof damageSchema>,unknown,z.output<typeof damageSchema>>({ resolver: zodResolver(damageSchema),defaultValues: { partReplaced: false,replacedPartSerialNumber: '',partCost: null } });
  const isReplaced = form.watch('partReplaced');
  return <form className="inline-form" onSubmit={(event) => { void form.handleSubmit(onSave)(event); }}><div className="form-grid"><label>Damaged part name<input required {...form.register('damagedPartName')} /></label><label>Observation notes<textarea required {...form.register('observationNotes')} /></label></div><label className="checkbox-field"><input type="checkbox" {...form.register('partReplaced')} />Part replaced</label>{isReplaced ? <div className="form-grid"><label>Replacement serial number<input required {...form.register('replacedPartSerialNumber')} /></label><label>Part cost (internal)<input required inputMode="decimal" {...form.register('partCost')} /></label></div> : null}
    {Object.entries(form.formState.errors).map(([key,value]) => <p className="field-error" key={key}>{value.message}</p>)}{error ? <p role="alert" className="field-error">{error}</p> : null}<div className="form-actions"><button type="submit" className="button primary" disabled={isPending}><Save size={16} />Save observation</button></div></form>;
}