'use client';

import Link from 'next/link';
import { useRouter,useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight,ChevronLeft,ChevronRight,Plus,Search,SlidersHorizontal,ClipboardList,Pencil,FileDown,CalendarCheck,RotateCcw,Star } from 'lucide-react';
import { useEffect,useState,type FormEvent } from 'react';
import { EntityPicker } from '@/components/ui/EntityPicker';
import { listSchema,type Resource,type Row } from '@/schemas/resources';
import type { Actor } from '@/lib/rbac';
import { Status } from '@/components/ui/Status';
import { AssetBatchForm } from '@/features/assets/AssetBatchForm';
import { ExportCsvButton } from '@/features/assets/ExportCsvButton';
import { AssetValidityPanel,RecalibrationPanel } from '@/features/assets/AssetJobPanels';
import { fetchNotStartedIds } from '@/features/assets/asset-selection';
import { CertificateOptionsForm } from '@/features/calibration/CertificateOptionsForm';
import { ResourceForm } from './ResourceForm';
import { api,text,rows } from './api';
import { UserControls } from './UserControls';
import { useMasterInstruments } from './master-instruments';

const config: Record<Resource,{ title: string; subtitle: string; columns: [string,string][]; action: string }> = {
  assets: { title: 'Pipette inventory',subtitle: 'Calibration jobs',action: 'Register pipettes',columns: [['inventoryNumber','Inventory no.'],['serialNumber','Serial number'],['customerName','Customer'],['pipette','Manufacturer / model'],['rangeChannels','Range (uL) / channels'],['calibrationValidityMonths','Validity'],['calibrationDate','Calibration date'],['progress','Progress']] },
  customers: { title: 'Customers',subtitle: 'Customer & department register',action: 'Add customer',columns: [['customerName','Customer'],['department','Department'],['contactName','Contact'],['email','Email'],['phone1','Phone']] },
  ranges: { title: 'Ranges & limits',subtitle: 'Pipette configuration register',action: 'Add configuration',columns: [['rangeLabel','Range (uL)'],['make','Manufacturer'],['model','Model'],['channel','Channel'],['timesToTest','Test points'],['limits','Limits']] },
  instruments: { title: 'Lab instruments',subtitle: 'Traceable calibration equipment',action: 'Add instrument',columns: [['makeModel','Make / model'],['instrumentType','Type'],['serialNumber','Serial number'],['calibrationDueDate','Calibration due'],['isMaster','Master equipment']] },
  'lab-dimensions': { title: 'Environmental conditions',subtitle: 'Environmental condition by calibration date',action: 'New environmental condition',columns: [['processDate','Calibration date'],['serviceMode','Mode'],['ddWaterTempC','Water (C)'],['roomTempC','Room (C)'],['humidityPct','Humidity (%)'],['airPressureHpa','Pressure (hPa)'],['zCorrectionValue','Z (uL/mg)']] },
  users: { title: 'User access',subtitle: 'Access requests and approved users',action: 'Add user',columns: [['displayName','Name'],['email','Email'],['role','Role'],['isActive','Access approval'],['externalSubject','Supabase user UUID']] },
};

function cell(row: Row, key: string) {
  if (key==='progress') return <Status value={text(row,key)} />;
  if (key==='limits') return <span className={rows(row.limits).length>0 ? 'ready-label' : 'warning-label'}>{rows(row.limits).length} captured</span>;
  if (key==='pipette') return <span className="cell-stack"><strong>{text(row,'make') || '-'}</strong><span className="muted">{text(row,'model')}</span></span>;
  if (key==='rangeChannels') {
    const channels = Number(text(row,'channelCount')) || 1;
    return <span className="cell-stack"><strong>{text(row,'rangeLabel') || '-'}</strong><span className="muted">{channels===1 ? 'Single channel' : `${channels} channels`}</span></span>;
  }
  if (key==='calibrationValidityMonths') return text(row,key) ? `${text(row,key)} months` : <span className="warning-label">Not assigned</span>;
  const value = text(row,key);
  return key.toLowerCase().includes('date') ? value.slice(0,10) || '-' : value.replaceAll('_',' ') || '-';
}

export function ResourceList({ resource,actor }: { resource: Resource; actor: Actor }) {
  const params = useSearchParams();
  const router = useRouter();
  const [customerId,setCustomerId] = useState(params.get('customerId') ?? '');
  const [selectedSessionIds,setSelectedSessionIds] = useState<string[]>([]);
  const [showCertificateOptions,setShowCertificateOptions] = useState(false);
  const [selectedAssetIds,setSelectedAssetIds] = useState<string[]>([]);
  const [selectedProgress,setSelectedProgress] = useState<Record<string,string>>({});
  const [openPanel,setOpenPanel] = useState<'validity' | 'recalibration' | null>(null);
  const [isSelectingAll,setIsSelectingAll] = useState(false);
  const [selectionError,setSelectionError] = useState('');
  const query = useQuery({ queryKey: [resource,params.toString()],queryFn: async () => listSchema.parse(await api(`${resource}?${params.toString()}`)) });
  const view = config[resource];
  const isFormOpen = params.get('new')==='1';
  const editing = resource==='ranges' ? query.data?.data.find((row) => text(row,'id')===params.get('edit')) : undefined;
  const isReadOnly = actor.isPreview || actor.role==='executive' || (['users'].includes(resource) && actor.role!=='admin');
  const updateUrl = (key: string,value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key,value); else next.delete(key);
    router.push(`/${resource}?${next}`);
  };
  const filter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [key,value] of new FormData(event.currentTarget)) if (typeof value==='string' && value) next.set(key,value);
    setSelectedAssetIds([]);
    setOpenPanel(null);
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
  const toggleAsset = (assetId: string, progress: string, enabled: boolean) => {
    setSelectedAssetIds((current) => enabled ? [...new Set([...current,assetId])] : current.filter((id) => id!==assetId));
    setSelectedProgress((current) => ({ ...current,[assetId]: progress }));
  };
  const clearAssets = () => { setSelectedAssetIds([]); setOpenPanel(null); };
  const selectAllNotStarted = async (enabled: boolean) => {
    if (!enabled) { setSelectedAssetIds([]); return; }
    setIsSelectingAll(true);
    setSelectionError('');
    try {
      const ids = await fetchNotStartedIds(params);
      setSelectedAssetIds(ids);
      setSelectedProgress(Object.fromEntries(ids.map((id) => [id,'not_started'])));
    }
    catch (error) { setSelectionError(error instanceof Error ? error.message : 'Could not select pipettes'); }
    finally { setIsSelectingAll(false); }
  };
  const readyIds = (query.data?.data ?? []).map((row) => text(row,'latestSessionId')).filter(Boolean);
  const pendingIds = (query.data?.data ?? []).filter((row) => text(row,'progress')==='not_started').map((row) => text(row,'id'));
  const canAssign = !isReadOnly && !actor.isPreview;
  const isAllCompleted = selectedAssetIds.length>0 && selectedAssetIds.every((id) => selectedProgress[id]==='completed');
  return <><div className="page-heading"><div><div className="eyebrow">{view.subtitle}</div><h1>{view.title}</h1></div><div className="heading-actions">{resource==='assets' ? <ExportCsvButton isDisabled={actor.isPreview} /> : null}<button className="button primary" onClick={() => { updateUrl('new','1'); }} disabled={!actor.isPreview && isReadOnly}><Plus size={17} />{view.action}</button></div></div>
    {isFormOpen ? resource==='assets' ? <AssetBatchForm isReadOnly={isReadOnly} onClose={() => { updateUrl('new',''); }} /> : <ResourceForm resource={resource} isReadOnly={isReadOnly} canManageInstruments={actor.isPreview || actor.role!=='executive'} onClose={() => { updateUrl('new',''); }} /> : null}
    {editing ? <ResourceForm key={text(editing,'id')} resource="ranges" initialRow={editing} isReadOnly={isReadOnly} onClose={() => { updateUrl('edit',''); }} /> : null}
    <section className="register-section"><div className="register-top"><h2>{resource==='assets' ? 'All pipettes' : 'All records'} <span className="count">{query.data?.meta.total ?? '-'}</span></h2><span className="muted">{query.isFetching ? 'Updating...' : 'Latest records'}</span></div>
      <form className="filter-bar" onSubmit={filter}><label className="search-field"><Search size={17} /><input type="search" name="search" aria-label="Search records" defaultValue={params.get('search') ?? ''} placeholder={resource==='assets' ? 'Search inventory, serial or invoice...' : 'Search records...'} /></label>
        {resource==='assets' ? <><label className="filter-select"><SlidersHorizontal size={15} /><select aria-label="Progress filter" name="progress" defaultValue={params.get('progress') ?? ''}><option value="">All progress</option><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></label><label className="date-filter">Due by<input type="date" name="dueDate" defaultValue={params.get('dueDate') ?? ''} /></label></> : null}
        <button className="button secondary" type="submit">Apply</button>
        {resource==='assets' ? <div className="customer-filter"><EntityPicker resource="customers" label="Customer / department" value={customerId} onChange={setCustomerId} isOptional /><input type="hidden" name="customerId" value={customerId} /><button className="icon-button" type="button" title="Clear customer filter" aria-label="Clear customer filter" onClick={() => { setCustomerId(''); }}><ChevronLeft size={14} /></button></div> : null}
      </form>
      {selectionError ? <p role="alert" className="field-error">{selectionError}</p> : null}
      {resource==='assets' && selectedAssetIds.length>0 ? <div className="selection-bar" role="status"><span>{selectedAssetIds.length} pipette{selectedAssetIds.length>1 ? 's' : ''} selected</span><button className="button primary" type="button" disabled={!canAssign} onClick={() => { setOpenPanel('validity'); }}><CalendarCheck size={16} />Assign calibration validity</button><button className="button secondary" type="button" disabled={!canAssign || !isAllCompleted} title={isAllCompleted ? undefined : 'Select only completed pipettes to schedule a re-calibration'} onClick={() => { setOpenPanel('recalibration'); }}><RotateCcw size={16} />Schedule re-calibration</button><button className="button secondary" type="button" onClick={clearAssets}>Clear</button></div> : null}
      {resource==='assets' && openPanel==='validity' && selectedAssetIds.length>0 ? <AssetValidityPanel assetIds={selectedAssetIds} isReadOnly={!canAssign} onClose={(isSaved) => { setOpenPanel(null); if (isSaved) setSelectedAssetIds([]); }} /> : null}
      {resource==='assets' && openPanel==='recalibration' && isAllCompleted ? <RecalibrationPanel assetIds={selectedAssetIds} isReadOnly={!canAssign} onClose={(isSaved) => { setOpenPanel(null); if (isSaved) setSelectedAssetIds([]); }} /> : null}
      {resource==='assets' && selectedSessionIds.length>0 ? <div className="selection-bar" role="status"><span>{selectedSessionIds.length} certificate{selectedSessionIds.length>1 ? 's' : ''} selected</span><button className="button primary" type="button" onClick={() => { setShowCertificateOptions((value) => !value); }}><FileDown size={16} />{showCertificateOptions ? 'Hide options' : `Download certificate${selectedSessionIds.length>1 ? 's' : ''}`}</button><button className="button secondary" type="button" onClick={() => { setSelectedSessionIds([]); setShowCertificateOptions(false); }}>Clear</button></div> : null}
      {resource==='assets' && showCertificateOptions && selectedSessionIds.length>0 ? <section className="form-section bulk-certificate-panel"><h2>Certificate options</h2><p className="muted">These signature and date options apply to every selected certificate.</p><CertificateOptionsForm sessionIds={selectedSessionIds} onDone={() => { setShowCertificateOptions(false); }} /></section> : null}
      {query.isError ? <div className="empty-state" role="alert"><h3>Could not load records</h3><p>{query.error.message}</p><button className="button secondary" onClick={() => void query.refetch()}>Retry</button></div> : query.isPending ? <div className="empty-state" role="status">Loading records...</div> : !query.data.data.length ? <div className="empty-state"><ClipboardList size={32} /><h3>No records found</h3><button className="button secondary" onClick={() => { router.push(`/${resource}`); }}>Clear filters</button></div> : <div className="table-scroll"><table className={resource==='assets' ? 'data-table asset-table' : 'data-table'}><thead><tr>{view.columns.map(([key,label]) => <th key={key}>{label}</th>)}{resource==='assets' ? <th><label className="inline-check-label"><input className="inline-checkbox" type="checkbox" aria-label="Select all not started pipettes" title="Select all not started pipettes" checked={pendingIds.length>0 && pendingIds.every((id) => selectedAssetIds.includes(id))} disabled={!canAssign || !pendingIds.length || isSelectingAll} onChange={(event) => { void selectAllNotStarted(event.target.checked); }} />{isSelectingAll ? 'Selecting...' : 'Select'}</label></th> : null}{resource==='assets' ? <th><label className="inline-check-label"><input className="inline-checkbox" type="checkbox" aria-label="Select all ready certificates" checked={readyIds.length>0 && readyIds.every((id) => selectedSessionIds.includes(id))} disabled={!readyIds.length} onChange={(event) => { setSelectedSessionIds(event.target.checked ? readyIds : []); }} />Certificate</label></th> : null}{resource==='assets' || resource==='ranges' ? <th className="action-cell"><span className="sr-only">Record actions</span></th> : null}</tr></thead><tbody>{query.data.data.map((row) => {
        const sessionId = text(row,'latestSessionId');
        const canDownload = Boolean(sessionId);
        return <tr key={text(row,'id')}>{view.columns.map(([key]) => <td key={key} className={key==='inventoryNumber' ? 'inventory-cell' : undefined}>{resource==='users' && (key==='role' || key==='isActive') ? <UserControls row={row} field={key} /> : resource==='instruments' && key==='isMaster' ? <MasterInstrumentCell row={row} isReadOnly={isReadOnly} /> : resource==='assets' && key==='inventoryNumber' ? <Link href={`/assets/${text(row,'id')}`}>{cell(row,key)}</Link> : cell(row,key)}</td>)}{resource==='assets' ? <td>{text(row,'progress')!=='in_progress' ? <label className="inline-check-label"><input className="inline-checkbox" type="checkbox" aria-label={`Select ${text(row,'inventoryNumber')}`} checked={selectedAssetIds.includes(text(row,'id'))} disabled={!canAssign} onChange={(event) => { toggleAsset(text(row,'id'),text(row,'progress'),event.target.checked); }} /><span>{text(row,'progress')==='completed' ? 'Re-calibrate' : text(row,'calibrationValidityMonths') ? 'Assigned' : 'Pending'}</span></label> : <span className="muted">-</span>}</td> : null}{resource==='assets' ? <td><label className="inline-check-label"><input className="inline-checkbox" type="checkbox" aria-label={`Select ${text(row,'inventoryNumber')} certificate`} checked={canDownload && selectedSessionIds.includes(sessionId)} disabled={!canDownload} onChange={(event) => { if (!sessionId) return; toggleSession(sessionId,event.target.checked); }} /><span>{canDownload ? 'Ready' : 'Not eligible'}</span></label></td> : null}{resource==='assets' ? <td className="action-cell"><Link className="row-action" href={`/assets/${text(row,'id')}`} aria-label={`Open inventory ${text(row,'inventoryNumber')}`} title="Open pipette"><ArrowRight size={17} /></Link></td> : resource==='ranges' ? <td><button className="icon-button" title="Edit limits" aria-label={`Edit limits for ${text(row,'model')}`} onClick={() => { updateUrl('edit',text(row,'id')); }}><Pencil size={15} /></button></td> : null}</tr>;
      })}</tbody></table></div>}
      <div className="pagination"><span>{query.data ? `${query.data.meta.total} records · Page ${query.data.meta.page}` : ''}</span><div><button className="icon-button" title="Previous page" aria-label="Previous page" disabled={!query.data || query.data.meta.page===1} onClick={() => { updateUrl('page',String((query.data?.meta.page ?? 1)-1)); }}><ChevronLeft size={18} /></button><button className="icon-button" title="Next page" aria-label="Next page" disabled={!query.data || query.data.meta.page*query.data.meta.pageSize>=query.data.meta.total} onClick={() => { updateUrl('page',String((query.data?.meta.page ?? 1)+1)); }}><ChevronRight size={18} /></button></div></div>
    </section>
  </>;
}

/** Master flag for one instrument, with an action to make it the master for its type. */
function MasterInstrumentCell({ row,isReadOnly }: { row: Row; isReadOnly: boolean }) {
  const { assign } = useMasterInstruments(false);
  if (row.isMaster===true) return <span className="ready-label"><Star size={13} /> Master</span>;
  return <><button type="button" className="button secondary compact-button" disabled={isReadOnly || assign.isPending} onClick={() => { assign.mutate(text(row,'id')); }}>{assign.isPending ? 'Saving...' : 'Make master'}</button>{assign.isError ? <span className="field-error">{assign.error.message}</span> : null}</>;
}
