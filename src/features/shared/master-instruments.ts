'use client';

import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { rowSchema,type InstrumentType } from '@/schemas/resources';
import { api,text } from './api';

const mastersSchema = z.object({ masters: z.array(rowSchema) });

/** The master instrument per measurement-device type, and a mutation to assign a different one for future use. */
export function useMasterInstruments(isEnabled = true) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['instruments','masters'],enabled: isEnabled,queryFn: async () => mastersSchema.parse(await api('instruments/masters')) });
  const masterId = (type: InstrumentType) => text(query.data?.masters.find((row) => text(row,'instrumentType')===type),'id');
  const assign = useMutation({ mutationFn: (instrumentId: string) => api('instruments/masters','POST',{ instrumentId }),onSuccess: () => client.invalidateQueries({ queryKey: ['instruments'] }) });
  return { query,masterId,assign };
}
