'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { voidSchema } from '@/schemas/resources';
import { api } from '@/features/shared/api';

export function VoidCertificateForm({ id,sessionId }: { id: string; sessionId: string }) {
  const client = useQueryClient();
  const form = useForm<z.infer<typeof voidSchema>>({ resolver: zodResolver(voidSchema) });
  const mutation = useMutation({ mutationFn: (data: z.infer<typeof voidSchema>) => api(`certificates/${id}/void`,'POST',data),onSuccess: () => client.invalidateQueries({ queryKey: ['session',sessionId] }) });
  return <details className="void-section"><summary>Void certificate</summary><form onSubmit={(event) => { void form.handleSubmit((data) => { mutation.mutate(data); })(event); }}><label>Void reason<textarea required {...form.register('reason')} /></label>{mutation.isError ? <p role="alert" className="field-error">{mutation.error.message}</p> : null}<button className="button secondary full-width" disabled={mutation.isPending} type="submit">Void stored certificate</button></form></details>;
}