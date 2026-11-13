'use client';

import Link from 'next/link';
import { useRouter,useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight,ChevronLeft,ChevronRight,Plus,Search,SlidersHorizontal,ClipboardList,Pencil,FileDown } from 'lucide-react';
import { useEffect,useState,type FormEvent } from 'react';
import { EntityPicker } from '@/components/ui/EntityPicker';
import { listSchema,type Resource,type Row } from '@/schemas/resources';
import type { Actor } from '@/lib/rbac';
import { Status } from '@/components/ui/Status';
import { AssetBatchForm } from '@/features/assets/AssetBatchForm';
import { ResourceForm } from './ResourceForm';
import { api,text,rows } from './api';
import { UserControls } from './UserControls';

const config: Record<Resource,{ title: string; subtitle: string; columns: [string,string][]; action: string }> = {
  assets: { title: 'Pipette inventory',subtitle: 'Calibration jobs',action: 'Register pipettes',columns: [['inventoryNumber','Inventory no.'],['serialNumber','Serial number'],['customerName','Customer'],['rangeLabel','Range (uL)'],['make','Manufacturer'],['progress','Progress']] },
  customers: { title: 'Customers',subtitle: 'Customer & department register',action: 'Add customer',columns: [['customerName','Customer'],['department','Department'],['contactName','Contact'],['email','Email'],['phone1','Phone']] },
  ranges: { title: 'Ranges & limits',subtitle: 'Pipette configuration register',action: 'Add configuration',columns: [['rangeLabel','Range (uL)'],['make','Manufacturer'],['model','Model'],['channel','Channel'],['timesToTest','Test points'],['limits','Limits']] },
  instruments: { title: 'Lab instruments',subtitle: 'Traceable calibration equipment',action: 'Add instrument',columns: [['makeModel','Make / model'],['instrumentType','Type'],['serialNumber','Serial number'],['calibrationDueDate','Calibration due']] },
  'lab-dimensions': { title: 'Lab conditions',subtitle: 'Environmental conditions by sitting',action: 'New lab sitting',columns: [['processDate','Process date'],['serviceMode','Mode'],['ddWaterTempC','Water (C)'],['roomTempC','Room (C)'],['humidityPct','Humidity (%)'],['airPressureHpa','Pressure (hPa)'],['zCorrectionValue','Z (uL/mg)']] },
  users: { title: 'User access',subtitle: 'Access requests and approved users',action: 'Add user',columns: [['displayName','Name'],['email','Email'],['role','Role'],['isActive','Access approval'],['externalSubject','Supabase user UUID']] },
};

function cell(row: Row, key: string) {
  if (key==='progress') return <Status value={text(row,key)} />;
  if (key==='limits') return <span className={rows(row.limits).length>0 ? 'ready-label' : 'warning-label'}>{rows(row.limits).length} captured</span>;
  const value = text(row,key);
  return key.toLowerCase().includes('date') ? value.slice(0,10) : value.replaceAll('_',' ') || '-';
}

export function ResourceList({ resource,actor }: { resource: Resource; actor: Actor }) {
  const params = useSearchParams();
  const router = useRouter();
  const [customerId,setCustomerId] = useState(params.get('customerId') ?? '');
  const [selectedSessionIds,setSelectedSessionIds] = useState<string[]>([]);
  const [bulkDownloadError,setBulkDownloadError] = useState('');
  const [isDownloading,setIsDownloading] = useState(false);
  const query = useQuery({ queryKey: [resource,params.toString()],queryFn: async () => listSchema.parse(await api(`${resource}?${params.toString()}`)) });
  const view = config[resource];
  const isFormOpen = params.get('new')==='1';
  const editing = resource==='ranges' ? query.data?.data.find((row) => text(row,'id')===params.get('edit')) : undefined;
  const isReadOnly = actor.isPreview || actor.role==='executive' || (['ranges','instruments','users'].includes(resource) && actor.role!=='admin');
  const updateUrl = (key: string,value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key,value); else next.delete(key);
    router.push(`/${resource}?${next}`);
  };
  const filter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [key,value] of new FormData(event.currentTarget)) if (typeof value==='string' && value) next.set(key,value);
    router.push(`/${resource}?${next}`);
  };
  useEffect(() => {
    if (resource!=='assets') return;
    const allowed = new Set((query.data?.data ?? []).map((row) => text(row,'latestSessionId')).filter(Boolean));
    setSelectedSessionIds((current) => current.filter((id) => allowed.has(id)));
  }, [query.data,resource]);
  const toggleSession = (sessionId: string, enabled: boolean) => {
    setSelectedSessionIds((current) => enabled ? [...new Set([...current,sessionId])] : current.filter((id) => id!==sessionId));
  };
  const downloadSelectedCertificates = async () => {
    const ids = [...selectedSessionIds];
    if (!ids.length) return;
    setIsDownloading(true);
    setBulkDownloadError('');
    try {
      for (const sessionId of ids) {
        const response = await fetch(`/api/v1/sessions/${sessionId}/certificate-download`);
        if (!response.ok) {
          const problem = await response.json().catch(() => null) as { detail?: string } | null;
          throw new Error(problem?.detail || 'Unable to download one or more certificates');
        }
        const blob = await response.blob();
        const fallbackName = `certificate_${sessionId}.pdf`;
        const disposition = response.headers.get('content-disposition') ?? '';
        const match = disposition.match(/filename="([^"]+)"/i);
        const filename = (match?.[1] ?? fallbackName).trim() || fallbackName;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setBulkDownloadError(error instanceof Error ? error.message : 'Bulk certificate download failed');
    } finally {
      setIsDownloading(false);
    }
  };
  return <><div className="page-heading"><div><div className="eyebrow">{view.subtitle}</div><h1>{view.title}</h1></div><button className="button primary" onClick={() => { updateUrl('new','1'); }} disabled={!actor.isPreview && isReadOnly}><Plus size={17} />{view.action}</button></div>
    {isFormOpen ? resource==='assets' ? <AssetBatchForm isReadOnly={isReadOnly} onClose={() => { updateUrl('new',''); }} /> : <ResourceForm resource={resource} isReadOnly={isReadOnly} canManageInstruments={actor.isPreview || actor.role==='admin'} onClose={() => { updateUrl('new',''); }} /> : null}
    {editing ? <ResourceForm key={text(editing,'id')} resource="ranges" initialRow={editing} isReadOnly={isReadOnly} onClose={() => { updateUrl('edit',''); }} /> : null}
    <section className="register-section"><div className="register-top"><h2>{resource==='assets' ? 'All pipettes' : 'All records'} <span className="count">{query.data?.meta.total ?? '-'}</span></h2><span className="muted">{query.isFetching ? 'Updating...' : 'Latest records'}</span>{resource==='assets' ? <button className="button secondary" type="button" disabled={!selectedSessionIds.length || isDownloading} onClick={() => { void downloadSelectedCertificates(); }}><FileDown size={16} />{isDownloading ? 'Downloading...' : `Download selected certificates (${selectedSessionIds.length})`}</button> : null}</div>
      <form className="filter-bar" onSubmit={filter}><label className="search-field"><Search size={17} /><input type="search" name="search" aria-label="Search records" defaultValue={params.get('search') ?? ''} placeholder={resource==='assets' ? 'Search inventory, serial or invoice...' : 'Search records...'} /></label>
        {resource==='assets' ? <><label className="filter-select"><SlidersHorizontal size={15} /><select aria-label="Progress filter" name="progress" defaultValue={params.get('progress') ?? ''}><option value="">All progress</option><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></label><label className="date-filter">Due by<input type="date" name="dueDate" defaultValue={params.get('dueDate') ?? ''} /></label></> : null}
        <button className="button secondary" type="submit">Apply</button>
        {resource==='assets' ? <div className="customer-filter"><EntityPicker resource="customers" label="Customer / department" value={customerId} onChange={setCustomerId} isOptional /><input type="hidden" name="customerId" value={customerId} /><button className="icon-button" type="button" title="Clear customer filter" aria-label="Clear customer filter" onClick={() => { setCustomerId(''); }}><ChevronLeft size={14} /></button></div> : null}
      </form>
      {bulkDownloadError ? <p role="alert" className="field-error">{bulkDownloadError}</p> : null}
      {query.isError ? <div className="empty-state" role="alert"><h3>Could not load records</h3><p>{query.error.message}</p><button className="button secondary" onClick={() => void query.refetch()}>Retry</button></div> : query.isPending ? <div className="empty-state" role="status">Loading records...</div> : !query.data.data.length ? <div className="empty-state"><ClipboardList size={32} /><h3>No records found</h3><button className="button secondary" onClick={() => { router.push(`/${resource}`); }}>Clear filters</button></div> : <div className="table-scroll"><table className="data-table"><thead><tr>{view.columns.map(([key,label]) => <th key={key}>{label}</th>)}{resource==='assets' ? <th>Select cert</th> : null}{resource==='assets' || resource==='ranges' ? <th><span className="sr-only">Record actions</span></th> : null}</tr></thead><tbody>{query.data.data.map((row) => {
        const sessionId = text(row,'latestSessionId');
        const canDownload = Boolean(sessionId);
        return <tr key={text(row,'id')}>{view.columns.map(([key]) => <td key={key} className={key==='inventoryNumber' ? 'inventory-cell' : undefined}>{resource==='users' && (key==='role' || key==='isActive') ? <UserControls row={row} field={key} /> : cell(row,key)}</td>)}{resource==='assets' ? <td><label className="inline-check-label"><input className="inline-checkbox" type="checkbox" aria-label={`Select ${text(row,'inventoryNumber')} certificate`} checked={canDownload && selectedSessionIds.includes(sessionId)} disabled={!canDownload || isDownloading} onChange={(event) => { if (!sessionId) return; toggleSession(sessionId,event.target.checked); }} /><span>{canDownload ? 'Ready' : 'Not eligible'}</span></label></td> : null}{resource==='assets' ? <td><Link className="row-action" href={`/assets/${text(row,'id')}`} aria-label={`Open inventory ${text(row,'inventoryNumber')}`} title="Open pipette"><ArrowRight size={17} /></Link></td> : resource==='ranges' ? <td><button className="icon-button" title="Edit limits" aria-label={`Edit limits for ${text(row,'model')}`} onClick={() => { updateUrl('edit',text(row,'id')); }}><Pencil size={15} /></button></td> : null}</tr>;
      })}</tbody></table></div>}
      <div className="pagination"><span>{query.data ? `${query.data.meta.total} records · Page ${query.data.meta.page}` : ''}</span><div><button className="icon-button" title="Previous page" aria-label="Previous page" disabled={!query.data || query.data.meta.page===1} onClick={() => { updateUrl('page',String((query.data?.meta.page ?? 1)-1)); }}><ChevronLeft size={18} /></button><button className="icon-button" title="Next page" aria-label="Next page" disabled={!query.data || query.data.meta.page*query.data.meta.pageSize>=query.data.meta.total} onClick={() => { updateUrl('page',String((query.data?.meta.page ?? 1)+1)); }}><ChevronRight size={18} /></button></div></div>
    </section>
  </>;
}