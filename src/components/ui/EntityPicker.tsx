'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { listSchema,type InstrumentType,type Resource,type Row } from '@/schemas/resources';
import { api,text } from '@/features/shared/api';

function optionLabel(resource: Resource,row: Row) {
  if (resource==='lab-dimensions') return `${text(row,'processDate').slice(0,10)} / ${text(row,'serviceMode')} / Water ${text(row,'ddWaterTempC')} C / Room ${text(row,'roomTempC')} C / ${text(row,'humidityPct')}% RH / ${text(row,'airPressureHpa')} hPa`;
  const description = ['customerName','department','make','model','rangeLabel','channel','makeModel','serialNumber'].map((key) => text(row,key)).filter(Boolean).join(' / ');
  return resource==='instruments' ? `${description} / Due ${text(row,'calibrationDueDate').slice(0,10)}` : description;
}

export function EntityPicker({ resource,label,value,onChange,instrumentType,validOn,isOptional = false,onCreateRequest,createLabel = 'Add new' }: { resource: Resource; label: string; value: string; onChange: (value: string) => void; instrumentType?: InstrumentType; validOn?: string; isOptional?: boolean; onCreateRequest?: () => void; createLabel?: string }) {
  const [search,setSearch] = useState('');
  const query = useQuery({ queryKey: [resource,'picker',search,instrumentType,validOn],queryFn: async () => {
    const params = new URLSearchParams({ pageSize: '100',search });
    if (instrumentType) params.set('instrumentType',instrumentType);
    if (validOn) params.set('validOn',validOn);
    return listSchema.parse(await api(`${resource}?${params}`));
  } });
  const options = query.data?.data ?? [];
  return <div className="entity-picker"><label>{label}<input type="search" aria-label={`Search ${label}`} placeholder="Search..." value={search} onChange={(event) => { setSearch(event.target.value); }} /></label>
    <select aria-label={label} required={!isOptional} value={value} onChange={(event) => { onChange(event.target.value); }}><option value="">Select {label.toLowerCase()}</option>
      {value && !options.some((row) => text(row,'id')===value) ? <option value={value}>Selected record</option> : null}
      {options.map((row) => <option key={text(row,'id')} value={text(row,'id')}>{optionLabel(resource,row)}</option>)}</select>
    {query.isPending ? <span role="status" className="muted">Loading {label.toLowerCase()}...</span> : !query.isError && !options.length ? <span className="muted">No matching {label.toLowerCase()} found.</span> : null}
    {onCreateRequest ? <button type="button" className="button primary inline-picker-action" onClick={onCreateRequest}><Plus size={16} />{createLabel}</button> : null}
    {query.isError ? <span className="field-error">{query.error.message}</span> : null}
  </div>;
}