import { z } from 'zod';
import { querySchema, type Resource, type Row } from '@/schemas/resources';

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const customers = [
  { id: id(10),customerName: 'Coastal Life Sciences',department: 'GEL Room',address1: 'Research Campus, Mangaluru',email: 'lab@example.org',phone1: '0000000000',contactName: 'Lab manager' },
  { id: id(11),customerName: 'Meridian Research Centre',department: 'Quality Control',address1: 'Science Park',email: 'qc@example.org',phone1: '0000000000',contactName: 'QC manager' },
];
const ranges = [
  { id: id(20),rangeLabel: '2-20',channel: 'single',make: 'Gilson',model: 'Pipetmann P20',timesToTest: 3,repeats: 1,limits: [{ testPointPct: 10,inaccuracyLimitPct: '10',imprecisionLimitPct: '5' },{ testPointPct: 50,inaccuracyLimitPct: '2',imprecisionLimitPct: '1' },{ testPointPct: 100,inaccuracyLimitPct: '1',imprecisionLimitPct: '0.5' }] },
  { id: id(21),rangeLabel: '10-100',channel: 'eight',make: 'Eppendorf',model: 'Research plus',timesToTest: 3,repeats: 8,limits: [] },
  { id: id(22),rangeLabel: '50',channel: 'single',make: 'Gilson',model: 'Fixed 50',timesToTest: 1,repeats: 1,limits: [] },
];
const assets = Array.from({ length: 8 },(_,index) => ({ id: id(100+index),customerId: id(index%2 ? 11 : 10),customerName: customers[index%2]?.customerName ?? '',rangeThresholdId: id(20+index%3),rangeLabel: ranges[index%3]?.rangeLabel ?? '',make: ranges[index%3]?.make ?? '',serialNumber: `LK${20869+index}`,inventoryNumber: `202609${844+index}`,invoiceNumber: 'VFL/26-27/0184',progress: 'not_started',customerAssetId: null }));
const instruments = ['balance','air_thermometer','water_thermometer'].map((type,index) => ({ id: id(30+index),instrumentType: type,makeModel: ['Sartorius BCE224','Testo 622','Testo 108'][index],serialNumber: `LAB-${index+1}`,calibrationDueDate: '2027-12-31T00:00:00.000Z' }));
const labs = [{ id: id(40),processDate: '2026-11-07T00:00:00.000Z',serviceMode: 'onsite',ddWaterTempC: '29.4',roomTempC: '29.4',humidityPct: '74',airPressureHpa: '1008.8',zCorrectionValue: '1.0052',zSourceVersion: 'ISO8655-6:2022-TableA1-transcribed-UNVERIFIED' }];

export function previewList(resource: Resource, query: z.infer<typeof querySchema>) {
  const rows: Row[] = { customers,ranges,assets,instruments,'lab-dimensions': labs,users: [] }[resource];
  const matched = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.search.toLowerCase()) && (!query.progress || row.progress===query.progress) && (!query.customerId || row.customerId===query.customerId) && !(resource==='assets' && query.dueDate));
  return { data: matched.slice((query.page-1)*query.pageSize,query.page*query.pageSize),meta: { page: query.page,pageSize: query.pageSize,total: matched.length } };
}