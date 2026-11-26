import { describe,expect,it,vi } from 'vitest';
import { querySchema } from '@/schemas/resources';

const { findMany,count } = vi.hoisted(() => ({ findMany: vi.fn().mockResolvedValue([]),count: vi.fn().mockResolvedValue(0) }));
vi.mock('@/lib/db', () => ({
  db: {
    instrument: { findMany,count },
    masterInstrument: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  },
}));

import { listInventory } from './inventory';

describe('Instrument picker filtering', () => {
  it('filters type and calibration validity in the database before pagination', async () => {
    await listInventory('instruments',querySchema.parse({ pageSize: 100,search: 'Testo',instrumentType: 'water_thermometer',validOn: '2026-11-13' }));

    const where = {
      isActive: true,
      AND: [{ OR: [{ makeModel: { contains: 'Testo',mode: 'insensitive' } },{ serialNumber: { contains: 'Testo',mode: 'insensitive' } }] }],
      instrumentType: 'water_thermometer',
      calibrationDueDate: { gte: new Date('2026-11-13') },
    };
    expect(findMany).toHaveBeenCalledWith({ where,skip: 0,take: 100,orderBy: { calibrationDueDate: 'desc' } });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('matches every search word so multi-word searches find records', async () => {
    findMany.mockClear();
    await listInventory('instruments',querySchema.parse({ search: 'Testo 108' }));
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ where: { AND: [{ OR: [{ makeModel: { contains: 'Testo' } },{ serialNumber: { contains: 'Testo' } }] },{ OR: [{ makeModel: { contains: '108' } },{ serialNumber: { contains: '108' } }] }] } });
  });
});
