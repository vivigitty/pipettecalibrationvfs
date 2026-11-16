import { renderToBuffer } from '@react-pdf/renderer';
import { readFile } from 'node:fs/promises';
import Decimal from 'decimal.js';
import { describe,expect,it } from 'vitest';

import { CertificateDocument } from './CertificateDocument';
import {
  certificateSchema,
  type CertificateData,
} from '../schemas/certificate';

const data = {
  inventoryNumber: 'PREVIEW-001',
  rangeLabel: '10-100',
  customerName: 'Sample Laboratory',
  address1: '123 Sample Street',
  address2: 'Second Floor',
  department: 'Quality Control',
  make: 'Sample Manufacturer',
  model: 'Variable Volume Pipette',
  serialNumber: 'PIP-12345',
  customerAssetId: 'LAB-001',
  invoiceNumber: 'INV-001',
  channel: 'single channel',
  contactName: 'Sample Contact',
  email: 'sample@example.com',
  phone1: '0000000000',
  phone2: null,
  serviceMode: 'onsite',
  sessionNo: 1,
  processDate: '2026-11-14',
  reminderDate: '2027-10-14',
  dueDate: '2027-11-14',
  servicedBy: 'Sample Technician',
  ddWaterTempC: '25',
  roomTempC: '25',
  humidityPct: '50',
  airPressureHpa: '1013',
  zCorrectionValue: '1.0052',

  balance: {
    makeModel: 'Sample Balance',
    serialNumber: 'BAL-001',
    calibrationDueDate: '2027-12-01',
  },
  air: {
    makeModel: 'Air Thermometer',
    serialNumber: 'AIR-001',
    calibrationDueDate: '2027-12-01',
  },
  water: {
    makeModel: 'Water Thermometer',
    serialNumber: 'WATER-001',
    calibrationDueDate: '2027-12-01',
  },

  damagedParts: 'Nil',
  replacedParts: 'Nil',
  logoUrl: null,
  footer: 'LAYOUT PREVIEW ONLY — NOT A VALID CERTIFICATE',
  signatureUrl: null,
  signatureDate: null,

  volumes: ['10', '50', '100'].map((nominalVolumeUl) => ({
    nominalVolumeUl,
    inaccuracyActualPct: '0',
    imprecisionActualPct: '0',
    inaccuracyLimitPct: '1',
    imprecisionLimitPct: '0.5',
    readings: Array.from({ length: 10 }, () => ({
      massG: new Decimal(nominalVolumeUl)
        .div('1.0052')
        .div(1000)
        .toString(),
      volumeUl: nominalVolumeUl,
    })),
  })),
} satisfies CertificateData;

function pageCount(bytes: Buffer) {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
}

describe('Approved certificate layout', () => {
  it.each([1,3])('fits %i volume sets with ten readings and the production logo on one page', async (volumeCount) => {
    const logo = await readFile(new URL('../../public/VFL_Logo.png',import.meta.url));
    const input = certificateSchema.parse({
      ...data,
      logoUrl: `data:image/png;base64,${logo.toString('base64')}`,
      volumes: data.volumes.slice(0,volumeCount),
    });
    const bytes = await renderToBuffer(CertificateDocument({ data: input }));
    expect(pageCount(bytes)).toBe(1);
    expect(bytes.toString('latin1')).toMatch(/\/Subtype\s*\/Image\b/);
  },15000);

  it('allows longer multichannel results to paginate instead of clipping readings', async () => {
    const input = certificateSchema.parse({
      ...data,
      volumes: data.volumes.map((volume) => ({
        ...volume,
        readings: Array.from({ length: 120 },(_,index) => volume.readings[index%10]),
      })),
    });
    const bytes = await renderToBuffer(CertificateDocument({ data: input }));
    expect(pageCount(bytes)).toBeGreaterThan(1);
  },15000);

  it('keeps one page with a signature image and date', async () => {
  const logo = await readFile(new URL('../../public/VFL_Logo.png',import.meta.url));
  const url = `data:image/png;base64,${logo.toString('base64')}`;
  const input = certificateSchema.parse({ ...data,logoUrl: url,signatureUrl: url,signatureDate: '2026-11-14' });
  expect(pageCount(await renderToBuffer(CertificateDocument({ data: input })))).toBe(1);
},15000);

});