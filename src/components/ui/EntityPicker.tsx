'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listSchema,type Resource } from '@/schemas/resources';
import { api,text } from '@/features/shared/api';

export function EntityPicker({ resource,label,value,onChange,filter,isOptional = false }: { resource: Resource; label: string; value: string; onChange: (value: string) => void; filter?: (row: Record<string,unknown>) => boolean; isOptional?: boolean }) {
  const [search,setSearch] = useState('');
  const query = useQuery({ queryKey: [resource,'picker',search],queryFn: async () => listSchema.parse(await api(`${resource}?pageSize=100&search=${encodeURIComponent(search)}`)) });
  const options = (query.data?.data ?? []).filter((row) => !filter || filter(row));
  return <div className="entity-picker"><label>{label}<input type="search" aria-label={`Search ${label}`} placeholder="Search..." value={search} onChange={(event) => { setSearch(event.target.value); }} /></label>
    <select aria-label={label} required={!isOptional} value={value} onChange={(event) => { onChange(event.target.value); }}><option value="">Select {label.toLowerCase()}</option>
      {value && !options.some((row) => text(row,'id')===value) ? <option value={value}>Selected record</option> : null}
      {options.map((row) => <option key={text(row,'id')} value={text(row,'id')}>{['customerName','department','make','model','rangeLabel','channel','makeModel','serialNumber','processDate'].map((key) => text(row,key)).filter(Boolean).join(' / ')}</option>)}</select>
    {query.isError ? <span className="field-error">{query.error.message}</span> : null}
  </div>;
}