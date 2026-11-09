'use client';

import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { useForm,useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { customerSchema,instrumentSchema,labSchema,rangeSchema,userSchema,type Resource,type Row } from '@/schemas/resources';
import { api,ApiError,text,rows } from './api';
import { fields } from './form-fields';

const draftSchema = z.record(z.string(),z.string());
const planSchema = z.object({ timesToTest: z.number(),repeats: z.number(),points: z.array(z.object({ pct: z.number(),volume: z.string() })) });

export function useResourceForm(resource: Exclude<Resource,'assets'>, onSaved: () => void, initialRow?: Row) {
  const client = useQueryClient();
  const defaultValues = Object.fromEntries(fields[resource].map((field) => [field.name,initialRow ? text(initialRow,field.name) : field.type==='select' ? field.options?.[0] ?? '' : field.type==='date' ? new Date().toISOString().slice(0,10) : '']));
  if (initialRow?.limits) for (const limit of rows(initialRow.limits)) {
    defaultValues[`inaccuracy${text(limit,'testPointPct')}`]=text(limit,'inaccuracyLimitPct');
    defaultValues[`imprecision${text(limit,'testPointPct')}`]=text(limit,'imprecisionLimitPct');
  }
  const form = useForm<z.infer<typeof draftSchema>>({ resolver: zodResolver(draftSchema),defaultValues });
  const values = useWatch({ control: form.control });
  const plan = useQuery({ queryKey: ['range-plan',values.rangeLabel,values.channel],enabled: resource==='ranges' && Boolean(values.rangeLabel),queryFn: async () => planSchema.parse(await api(`range-plan?rangeLabel=${encodeURIComponent(values.rangeLabel ?? '')}&channel=${values.channel ?? 'single'}`)) });
  const zFactor = useQuery({ queryKey: ['z-factor',values.ddWaterTempC,values.airPressureHpa],enabled: resource==='lab-dimensions' && Boolean(values.ddWaterTempC && values.airPressureHpa),queryFn: () => api(`z-factor?temperature=${encodeURIComponent(values.ddWaterTempC ?? '')}&pressure=${encodeURIComponent(values.airPressureHpa ?? '')}`) });
  const save = useMutation({ mutationFn: async (draft: Record<string,string>) => {
    const payload = buildPayload(resource,draft,plan.data?.points ?? []);
    return initialRow && resource==='ranges' ? api(`ranges/${text(initialRow,'id')}/limits`,'PATCH',{ limits: rangeSchema.parse(payload).limits }) : api(resource,'POST',payload);
  },onSuccess: async () => { await client.invalidateQueries({ queryKey: [resource] }); onSaved(); },onError: (error) => {
    if (error instanceof ApiError) for (const issue of error.fields) form.setError(issue.field,{ message: issue.message });
    if (error instanceof z.ZodError) for (const issue of error.issues) form.setError(String(issue.path[0]),{ message: issue.message });
  } });
  return { form,values,plan,zFactor,save };
}

function buildPayload(resource: Exclude<Resource,'assets'>, draft: Record<string,string>, points: { pct: number; volume: string }[]) {
  switch (resource) {
    case 'customers': return customerSchema.parse(draft);
    case 'instruments': return instrumentSchema.parse(draft);
    case 'lab-dimensions': return labSchema.parse(draft);
    case 'users': return userSchema.parse(draft);
    case 'ranges': return rangeSchema.parse({ rangeLabel: draft.rangeLabel,channel: draft.channel,make: draft.make,model: draft.model,limits: points.map((point) => ({ testPointPct: point.pct,inaccuracyLimitPct: draft[`inaccuracy${point.pct}`],imprecisionLimitPct: draft[`imprecision${point.pct}`] })) });
  }
}

export function zLabel(data: unknown) { return text(data,'zCorrectionValue'); }