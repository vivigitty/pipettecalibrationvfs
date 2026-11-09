'use client';

import { useMutation,useQueryClient } from '@tanstack/react-query';
import type { Row } from '@/schemas/resources';
import { userSchema } from '@/schemas/resources';
import { api,text } from './api';

export function UserControls({ row,field }: { row: Row; field: 'role' | 'isActive' }) {
  const client = useQueryClient();
  const update = useMutation({ mutationFn: (data: unknown) => api(`users/${text(row,'id')}`,'PATCH',data),onSuccess: () => client.invalidateQueries({ queryKey: ['users'] }) });
  return <div>{field==='role' ? <select className="inline-select" aria-label={`Role for ${text(row,'displayName')}`} value={text(row,'role')} disabled={update.isPending} onChange={(event) => { update.mutate({ role: userSchema.shape.role.parse(event.target.value) }); }}>{['technician','admin','executive'].map((role) => <option key={role} value={role}>{role}</option>)}</select> : <input className="inline-checkbox" type="checkbox" aria-label={`Active access for ${text(row,'displayName')}`} checked={row.isActive===true} disabled={update.isPending} onChange={(event) => { update.mutate({ isActive: event.target.checked }); }} />}{update.isError ? <span role="alert" className="field-error">{update.error.message}</span> : null}</div>;
}