'use client';

import { useMutation,useQueryClient } from '@tanstack/react-query';
import type { Row } from '@/schemas/resources';
import { userSchema } from '@/schemas/resources';
import { api,text } from './api';
import { Check, UserX } from 'lucide-react';

export function UserControls({ row,field }: { row: Row; field: 'role' | 'isActive' }) {
  const client = useQueryClient();
  const update = useMutation({ mutationFn: (data: unknown) => api(`users/${text(row,'id')}`,'PATCH',data),onSuccess: () => client.invalidateQueries({ queryKey: ['users'] }) });
  return <div>{field==='role' ? <select className="inline-select" aria-label={`Role for ${text(row,'displayName')}`} value={text(row,'role')} disabled={update.isPending} onChange={(event) => { update.mutate({ role: userSchema.shape.role.parse(event.target.value) }); }}>{['technician','admin','executive'].map((role) => <option key={role} value={role}>{role}</option>)}</select> : <button className="button secondary" type="button" title={row.isActive===true ? 'Suspend access' : 'Approve access'} disabled={update.isPending} onClick={() => { update.mutate({ isActive: row.isActive!==true }); }}>{row.isActive===true ? <UserX size={15} /> : <Check size={15} />}{row.isActive===true ? 'Suspend access' : 'Approve access'}</button>}{update.isError ? <span role="alert" className="field-error">{update.error.message}</span> : null}</div>;
}