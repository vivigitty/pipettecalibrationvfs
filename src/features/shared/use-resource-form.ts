'use client';

import { useEffect } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { useForm,useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { customerSchema,instrumentSchema,labSchema,rangeSchema,userSchema,type Resource,type Row } from '@/schemas/resources';
import { api,ApiError,text,rows } from './api';
import { fields } from './form-fields';

const draftSchema = z.record(z.string(),z.string());
const planSchema = z.object({ timesToTest: z.number(),repeats: z.number(),limitSource: z.string().nullish(),points: z.array(z.object({ pct: z.number(),volume: z.string(),suggested: z.object({ inaccuracyLimitPct: z.string(),imprecisionLimitPct: z.string() }).nullish() })) });

export function useResourceForm(resource: Exclude<Resource,'assets'>, onSaved: (saved?: unknown) => void, initialRow?: Row, prefillValues?: Record<string,string>) {
  const client = useQueryClient();
  const defaultValues = { ...Object.fromEntries(fields[resource].map((field) => [field.name,initialRow ? text(initialRow,field.name) : field.type==='select' ? field.options?.[0] ?? '' : field.type==='date' ? new Date().toISOString().slice(0,10) : ''])),...(prefillValues ?? {}) };
  if (initialRow?.limits) for (const limit of rows(initialRow.limits)) {
    defaultValues[`inaccuracy${text(limit,'testPointPct')}`]=text(limit,'inaccuracyLimitPct');
    defaultValues[`imprecision${text(limit,'testPointPct')}`]=text(limit,'imprecisionLimitPct');
  }
  const form = useForm<z.infer<typeof draftSchema>>({ resolver: zodResolver(draftSchema),defaultValues });
  const values = useWatch({ control: form.control });
  const plan = useQuery({ queryKey: ['range-plan',values.rangeLabel,values.channel],enabled: resource==='ranges' && Boolean(values.rangeLabel),queryFn: async () => planSchema.parse(await api(`range-plan?rangeLabel=${encodeURIComponent(values.rangeLabel ?? '')}&channel=${values.channel ?? 'single'}`)) });
  const planData = plan.data;
  useEffect(() => {
    // Pre-fill limits from the reference table for a new configuration; values the user typed are kept.
    if (resource!=='ranges' || initialRow || !planData) return;
    for (const point of planData.points) {
      for (const [field,value] of [[`inaccuracy${point.pct}`,point.suggested?.inaccuracyLimitPct],[`imprecision${point.pct}`,point.suggested?.imprecisionLimitPct]] as const) {
        if (!form.getFieldState(field).isDirty) form.setValue(field,value ?? '',{ shouldDirty: false });
      }
    }
  },[planData,resource,initialRow,form]);
  const hasZInputs = resource==='lab-dimensions' && isWithin(values.ddWaterTempC,15,30) && isWithin(values.airPressureHpa,800,1050);
  const zFactor = useQuery({ queryKey: ['z-factor',values.ddWaterTempC,values.airPressureHpa],enabled: hasZInputs,queryFn: () => api(`z-factor?temperature=${encodeURIComponent(values.ddWaterTempC ?? '')}&pressure=${encodeURIComponent(values.airPressureHpa ?? '')}`) });
  const save = useMutation({ mutationFn: async (draft: Record<string,string>) => {
    const payload = buildPayload(resource,draft,plan.data?.points ?? []);
    return initialRow && resource==='ranges' ? api(`ranges/${text(initialRow,'id')}/limits`,'PATCH',{ limits: rangeSchema.parse(payload).limits }) : api(resource,'POST',payload);
  },onSuccess: async (saved) => { await client.invalidateQueries({ queryKey: [resource] }); onSaved(saved); },onError: (error) => {
    if (error instanceof ApiError) for (const issue of error.fields) form.setError(issue.field,{ message: issue.message });
    if (error instanceof z.ZodError) for (const issue of error.issues) form.setError(String(issue.path[0]),{ message: issue.message });
  } });
  return { form,values,plan,zFactor,hasZInputs,save };
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

/** Gate for the Z lookup only: the ISO table covers 15-30 C water and 800-1050 hPa, so partial input is not sent while typing. */
function isWithin(value: string | undefined, min: number, max: number) {
  if (!value || !/^\d+(\.\d+)?$/.test(value.trim())) return false;
  const parsed = Number(value);
  return parsed>=min && parsed<=max;
}

export function zLabel(data: unknown) { return text(data,'zCorrectionValue'); }