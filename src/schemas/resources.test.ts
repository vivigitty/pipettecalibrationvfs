import { describe,expect,it } from 'vitest';
import { assetSchema,customerSchema,damageSchema,labSchema,querySchema,readingsSchema,userUpdateSchema } from './resources';

describe('FR-05 FR-08 FR-13 HTTP validation', () => {
  it.each([9,11])('rejects %s readings', (count) => { expect(readingsSchema.safeParse({ masses: Array<string>(count).fill('0.002') }).success).toBe(false); });
  it.each(['0','-1','abc','NaN','Infinity'])('rejects mass %s', (mass) => { expect(readingsSchema.safeParse({ masses: Array<string>(10).fill(mass) }).success).toBe(false); });
  it('accepts exactly ten positive decimal strings', () => { expect(readingsSchema.safeParse({ masses: Array<string>(10).fill('0.002') }).success).toBe(true); });
  it('requires replacement cost and serial', () => { expect(damageSchema.safeParse({ observationNotes: 'Cracked seal',damagedPartName: 'Seal',partReplaced: true }).success).toBe(false); });
  it('accepts an observation without replacement', () => { expect(damageSchema.safeParse({ observationNotes: 'Cracked seal',damagedPartName: 'Seal',partReplaced: false }).success).toBe(true); });
  it('bounds list pagination', () => { expect(querySchema.safeParse({ pageSize: '101' }).success).toBe(false); });
  it('rejects client status overrides', () => { expect(assetSchema.safeParse({ customerId: '00000000-0000-4000-8000-000000000010',rangeThresholdId: '00000000-0000-4000-8000-000000000020',inventoryNumber: 'JOB-1',serialNumber: 'SERIAL',invoiceNumber: 'INV',progress: 'completed' }).success).toBe(false); });
  it('rejects client Z values', () => { expect(labSchema.safeParse({ zCorrectionValue: '1.1' }).success).toBe(false); });
  it('rejects invalid customer email', () => { expect(customerSchema.safeParse({ customerName: 'Acme',department: 'QC',address1: 'Lab',phone1: '0000',contactName: 'QC',email: 'invalid' }).success).toBe(false); });
  it('does not implicitly activate a user during a role-only update', () => { expect(userUpdateSchema.parse({ role: 'technician' })).toEqual({ role: 'technician' }); });
  it('rejects empty user updates', () => { expect(userUpdateSchema.safeParse({}).success).toBe(false); });
});