import Decimal from 'decimal.js';
import { format, parseISO } from 'date-fns';

type Instrument = { makeModel: string; serialNumber: string; calibrationDueDate: Date };
export type ExportSession = {
  inventoryNumber: string; serialNumber: string; customerAssetId: string | null;
  customerName: string; address1: string; address2: string | null; email: string;
  phone1: string; phone2: string | null; contactName: string; department: string;
  rangeLabel: string; channel: 'single' | 'eight' | 'twelve' | 'sixteen' | 'twenty_four'; make: string; model: string;
  serviceMode: string; finalStatus: string; calibratedBy: string;
  processDate: Date; dueDate: Date; reminderDate: Date;
  ddWaterTempC: string; roomTempC: string; humidityPct: string; airPressureHpa: string; zCorrectionValue: string;
  balance: Instrument; air: Instrument; water: Instrument;
  damages: { damagedPartName: string; observationNotes: string; partReplaced: boolean; replacedPartSerialNumber: string | null }[];
  /** Ascending nominal volume; masses ordered by lot, then reading number. */
  volumes: { nominalVolumeUl: string; massesG: string[] }[];
};

const reading = (index: number) => String(index + 1);
const READING_HEADERS = [0, 1, 2].flatMap(() => Array.from({ length: 10 }, (_, index) => reading(index)));

export const EXPORT_HEADERS = [
  'Inventory NO', 'Customer Name and complete Address', 'Address 1', 'Address 2', 'e-mail', 'Phone I', 'Phone  II',
  'Contact', 'Department', 'Done on', 'Range', 'No of Chan', 'Model', 'Make', 'Sr.No of the pipette',
  'Problem Reported/ Observed ', 'Sp.Replaced', 'Spares Part No:', 'Progress', 'Month', 'Mode of Service ',
  'Calibration Date', 'Due Date', 'Reminder', ...READING_HEADERS,
  'Lab Name', 'Status', 'Damaged parts/Missing parts', 'Customer ID number', 'Balance used/Serial number',
  'Thermometer Serial No', 'Room Temp Measured', 'Water temperature measured', 'Humidity (RH)', 'Z Factor',
  'Calibrated by', 'Air Pressure', 'Additional per-channel readings (g)',
] as const;

// Stored dates are UTC-midnight; format from the ISO day to avoid timezone drift.
const day = (value: Date) => value.toISOString().slice(0, 10);
const fmt = (value: Date, pattern: string) => format(parseISO(day(value)), pattern);
const nil = (value?: string | null) => value?.trim() || 'Nil';
const joined = (items: string[]) => items.filter(Boolean).join('; ') || 'Nil';
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const mass = (value: string) => new Decimal(value).toFixed(4);
const instrument = (value: Instrument) => `${value.makeModel} / S.No: ${value.serialNumber} / Cal due : ${fmt(value.calibrationDueDate, 'dd-MM-yyyy')}`;

/** Export layout mirrors VFL's existing tracking sheet (sample_csv.xlsx). */
export function toExportRow(s: ExportSession): (string | number)[] {
  const replaced = s.damages.filter((damage) => damage.partReplaced);
  const masses = [0, 1, 2].flatMap((block) => Array.from({ length: 10 }, (_, index) => {
    const value = s.volumes[block]?.massesG[index];
    return value === undefined ? '' : mass(value);
  }));
  const extra = s.volumes.filter((volume) => volume.massesG.length > 10)
    .map((volume) => `${new Decimal(volume.nominalVolumeUl).toString()}uL: ${volume.massesG.slice(10).map(mass).join(' ')}`).join(' | ');
  return [
    s.inventoryNumber, s.customerName, s.address1, s.address2 ?? '', s.email, s.phone1, s.phone2 ?? '', s.contactName, s.department,
    day(s.processDate), `${s.rangeLabel} µl`, `${capitalize(s.channel)} Channel`, s.model, s.make, s.serialNumber,
    joined(s.damages.map((damage) => damage.observationNotes)), joined(replaced.map((damage) => damage.damagedPartName)),
    joined(replaced.map((damage) => damage.replacedPartSerialNumber ?? '')), 'Done', fmt(s.processDate, 'MMMM'), capitalize(s.serviceMode),
    day(s.processDate), day(s.dueDate), day(s.reminderDate), ...masses,
    s.department, capitalize(s.finalStatus), joined(s.damages.map((damage) => damage.damagedPartName)), nil(s.customerAssetId),
    instrument(s.balance),
    `Air - ${s.air.makeModel} S.No:${s.air.serialNumber} / Water - ${s.water.makeModel} S.No:${s.water.serialNumber} / Cal due : ${fmt(s.water.calibrationDueDate, 'dd-MM-yyyy')}`,
    new Decimal(s.roomTempC).toFixed(1), new Decimal(s.ddWaterTempC).toFixed(1), new Decimal(s.humidityPct).toFixed(1),
    new Decimal(s.zCorrectionValue).toFixed(4), s.calibratedBy, new Decimal(s.airPressureHpa).toFixed(1), extra,
  ];
}