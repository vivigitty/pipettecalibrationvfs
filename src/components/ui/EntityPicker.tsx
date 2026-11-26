'use client';

import { useRef,useState,type KeyboardEvent } from 'react';
import { keepPreviousData,useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { listSchema,type InstrumentType,type Resource,type Row } from '@/schemas/resources';
import { api,text } from '@/features/shared/api';

const MAX_VISIBLE_MATCHES = 8;

function optionLabel(resource: Resource,row: Row) {
  if (resource==='lab-dimensions') return `${text(row,'processDate').slice(0,10)} / ${text(row,'serviceMode')} / Water ${text(row,'ddWaterTempC')} C / Room ${text(row,'roomTempC')} C / ${text(row,'humidityPct')}% RH / ${text(row,'airPressureHpa')} hPa`;
  const description = ['customerName','department','make','model','rangeLabel','channel','makeModel','serialNumber'].map((key) => text(row,key)).filter(Boolean).join(' / ');
  if (resource==='instruments') return `${description} / Due ${text(row,'calibrationDueDate').slice(0,10)}${row.isMaster===true ? ' / Master' : ''}`;
  return resource==='ranges' ? `${description} uL` : description;
}

/**
 * Search box plus option list. While the user types, the list opens in place showing the matching
 * records, so a match can be picked with the mouse or with Arrow Down / Enter.
 */
export function EntityPicker({ resource,label,value,onChange,instrumentType,validOn,processDate,isOptional = false,onCreateRequest,createLabel = 'Add new' }: { resource: Resource; label: string; value: string; onChange: (value: string) => void; instrumentType?: InstrumentType; validOn?: string; processDate?: string; isOptional?: boolean; onCreateRequest?: () => void; createLabel?: string }) {
  const [search,setSearch] = useState('');
  const [isListOpen,setIsListOpen] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const query = useQuery({ queryKey: [resource,'picker',search,instrumentType,validOn,processDate],placeholderData: keepPreviousData,queryFn: async () => {
    const params = new URLSearchParams({ pageSize: '100',search: search.trim() });
    if (instrumentType) params.set('instrumentType',instrumentType);
    if (validOn) params.set('validOn',validOn);
    if (processDate) params.set('processDate',processDate);
    return listSchema.parse(await api(`${resource}?${params}`));
  } });
  const options = query.data?.data ?? [];
  const isExpanded = isListOpen && search.trim().length>0 && options.length>0;
  const choose = (id: string) => { onChange(id); setIsListOpen(false); };
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key==='ArrowDown' && options.length) { event.preventDefault(); setIsListOpen(true); selectRef.current?.focus(); }
    if (event.key==='Enter') {
      event.preventDefault();
      const [only] = options;
      if (options.length===1 && only) choose(text(only,'id'));
      else if (options.length) { setIsListOpen(true); selectRef.current?.focus(); }
    }
    if (event.key==='Escape') setIsListOpen(false);
  };
  const onListKey = (event: KeyboardEvent<HTMLSelectElement>) => {
    if (event.key==='Enter' && isExpanded) { event.preventDefault(); choose(event.currentTarget.value); }
    if (event.key==='Escape') setIsListOpen(false);
  };
  return <div className="entity-picker"><label>{label}<input type="search" aria-label={`Search ${label}`} placeholder="Type to search..." value={search} autoComplete="off" onChange={(event) => { setSearch(event.target.value); setIsListOpen(true); }} onKeyDown={onSearchKey} /></label>
    <select ref={selectRef} aria-label={label} required={!isOptional} value={value} size={isExpanded ? Math.min(options.length+1,MAX_VISIBLE_MATCHES) : undefined} className={isExpanded ? 'picker-list-open' : undefined}
      onChange={(event) => { onChange(event.target.value); }} onClick={() => { if (isExpanded) setIsListOpen(false); }} onKeyDown={onListKey} onBlur={() => { setIsListOpen(false); }}>
      <option value="">{isExpanded ? `${options.length} match${options.length===1 ? '' : 'es'} - select one` : `Select ${label.toLowerCase()}`}</option>
      {value && !options.some((row) => text(row,'id')===value) ? <option value={value}>Selected record</option> : null}
      {options.map((row) => <option key={text(row,'id')} value={text(row,'id')}>{optionLabel(resource,row)}</option>)}</select>
    {query.isPending ? <span role="status" className="muted">Loading {label.toLowerCase()}...</span> : !query.isError && !options.length ? <span className="muted">No matching {label.toLowerCase()} found.</span> : null}
    {onCreateRequest ? <button type="button" className="button primary inline-picker-action" onClick={onCreateRequest}><Plus size={16} />{createLabel}</button> : null}
    {query.isError ? <span className="field-error">{query.error.message}</span> : null}
  </div>;
}
