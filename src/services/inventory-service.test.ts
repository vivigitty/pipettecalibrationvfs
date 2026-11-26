import { beforeEach,describe,expect,it,vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    customer: { findMany: vi.fn() },
    rangeThreshold: { findMany: vi.fn() },
    asset: { findMany: vi.fn(),createManyAndReturn: vi.fn<(args: { data: { inventoryNumber: string }[] }) => Promise<unknown[]>>() },
    auditLog: { createMany: vi.fn() },
  };
  return { tx,transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
});

vi.mock('@/repositories/inventory', () => ({ transaction: mocks.transaction,inventoryDb: {},listInventory: vi.fn() }));
vi.mock('@/repositories/z-grid', () => ({ loadZGrid: vi.fn() }));
vi.mock('@/lib/rbac', () => ({ authorizeWrite: vi.fn() }));

import { createResource } from './inventory-service';

const actor = { id: '00000000-0000-4000-8000-000000000001',displayName: 'Technician',role: 'technician' as const,isPreview: false };
const customerId = '00000000-0000-4000-8000-000000000010';
const rangeThresholdId = '00000000-0000-4000-8000-000000000020';
const batch = (count: number) => ({ assets: Array.from({ length: count },(_,index) => ({ customerId,rangeThresholdId,serialNumber: `S${index}`,inventoryNumber: `INV-${index}` })) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tx.customer.findMany.mockResolvedValue([{ id: customerId }]);
  mocks.tx.rangeThreshold.findMany.mockResolvedValue([{ id: rangeThresholdId }]);
  mocks.tx.asset.findMany.mockResolvedValue([]);
  mocks.tx.asset.createManyAndReturn.mockImplementation(({ data }) => Promise.resolve(data.map((row,index) => ({ id: `00000000-0000-4000-8000-00000000010${index}`,...row }))));
});

describe('Pipette batch registration', () => {
  it('registers 50 pipettes with one insert and one audit insert', async () => {
    const rows = await createResource(actor,'assets',batch(50),'request');
    expect(rows).toHaveLength(50);
    expect(mocks.tx.asset.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(mocks.tx.auditLog.createMany).toHaveBeenCalledTimes(1);
  });

  it('rejects an inventory number repeated in the batch before touching the database', async () => {
    const input = batch(2);
    const second = input.assets[1];
    if (second) second.inventoryNumber = 'INV-0';
    await expect(createResource(actor,'assets',input,'request')).rejects.toThrow('entered more than once: INV-0');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('names inventory numbers that are already registered', async () => {
    mocks.tx.asset.findMany.mockResolvedValue([{ inventoryNumber: 'INV-1' }]);
    await expect(createResource(actor,'assets',batch(3),'request')).rejects.toThrow('already registered: INV-1');
    expect(mocks.tx.asset.createManyAndReturn).not.toHaveBeenCalled();
  });
});
