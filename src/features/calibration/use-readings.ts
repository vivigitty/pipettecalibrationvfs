'use client';

import { useEffect,useRef } from 'react';
import { useForm,useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { readingsSchema } from '@/schemas/resources';
import { api } from '@/features/shared/api';

export function useReadings(sessionId: string,lotNo: string,masses: string[],isReadOnly: boolean) {
  const client = useQueryClient();
  const form = useForm<z.infer<typeof readingsSchema>>({ resolver: zodResolver(readingsSchema),defaultValues: { masses: Array.from({ length: 10 },(_,index) => masses[index] ?? '') } });
  const values = useWatch({ control: form.control,name: 'masses' });
  const save = useMutation({ mutationFn: (data: z.infer<typeof readingsSchema>) => api(`sessions/${sessionId}/lots/${lotNo}`,'PATCH',data),onSuccess: async (_response,saved) => {
    if (JSON.stringify(form.getValues())===JSON.stringify(saved)) form.reset(saved);
    await client.invalidateQueries({ queryKey: ['session',sessionId] });
  } });
  const mutation = useRef(save.mutate);
  mutation.current = save.mutate;
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (isDirty) event.preventDefault(); };
    window.addEventListener('beforeunload',warn);
    return () => { window.removeEventListener('beforeunload',warn); };
  },[isDirty]);
  useEffect(() => {
    if (!isDirty || isReadOnly || save.isPending || save.isError) return;
    const timer = setTimeout(() => {
      const valid = readingsSchema.safeParse({ masses: values });
      if (valid.success) mutation.current(valid.data);
    },800);
    return () => { clearTimeout(timer); };
  },[values,isDirty,isReadOnly,save.isPending,save.isError]);
  return { form,save };
}