import { Prisma } from '@prisma/client';
import { beforeEach,describe,expect,it,vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    rangeThreshold: { findUniqueOrThrow: vi.fn() },
    rangeThresholdLimit: { findMany: vi.fn() },
    labDimension: { findUnique: vi.fn(),findUniqueOrThrow: vi.fn() },
    calibrationSession: { findFirst: vi.fn(),create: vi.fn() },
    calibrationVolumeResult: {
      create: vi.fn<(args: { data: Prisma.CalibrationVolumeResultUncheckedCreateInput }) => Promise<unknown>>(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn<(args: { data: Prisma.CalibrationVolumeResultUncheckedUpdateInput }) => Promise<unknown>>(),
    },
    calibrationLot: { createManyAndReturn: vi.fn<(args: { data: Prisma.CalibrationLotCreateManyInput[] }) => Promise<unknown>>(),findUnique: vi.fn(),update: vi.fn(),findMany: vi.fn() },
    calibrationReading: { findMany: vi.fn(),upsert: vi.fn<(args: { create: Prisma.CalibrationReadingUncheckedCreateInput }) => Promise<unknown>>() },
    asset: { update: vi.fn() },
    auditLog: { createMany: vi.fn<(args: { data: Prisma.AuditLogCreateManyInput[] }) => Promise<unknown>>() },
  };
  return { tx,lockAsset: vi.fn(),lockSession: vi.fn(),sessionDetail: vi.fn(),
    transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
});

vi.mock('@/repositories/inventory', () => ({ transaction: mocks.transaction }));
vi.mock('@/repositories/calibration', () => ({ lockAsset: mocks.lockAsset,lockSession: mocks.lockSession,sessionDetail: mocks.sessionDetail }));
vi.mock('@/lib/rbac', () => ({ authorizeWrite: vi.fn() }));

import { saveLot,startSession } from './calibration-service';

const actor = { id: '00000000-0000-4000-8000-000000000001',displayName: 'Technician',role: 'technician' as const,isPreview: false };
const labId = '00000000-0000-4000-8000-000000000040';
const decimal = (value: string) => new Prisma.Decimal(value);

beforeEach(() => { vi.resetAllMocks(); });

describe('Calibration transaction round trips and audit snapshots', () => {
  it.each([false,true])('starts a 36-lot session with batched writes and propagates audit failure (failure: %s)', async (auditFails) => {
    const { tx } = mocks;
    mocks.lockAsset.mockResolvedValue({ id: 'asset',customerId: 'customer',rangeThresholdId: 'range',progress: 'not_started' });
    tx.calibrationSession.findFirst.mockResolvedValue(null);
    tx.rangeThreshold.findUniqueOrThrow.mockResolvedValue({ id: 'range',rangeLabel: '10-100',channel: 'twelve',isActive: true });
    tx.labDimension.findUnique.mockResolvedValue({ processDate: new Date('2026-10-01') });
    tx.rangeThresholdLimit.findMany.mockResolvedValue([10,50,100].map((pct) => ({
      id: `limit-${pct}`,testPointPct: pct,nominalVolumeUl: decimal(String(pct)),inaccuracyLimitPct: decimal('1'),imprecisionLimitPct: decimal('1'),
    })));
    tx.calibrationSession.create.mockResolvedValue({ id: 'session' });
    tx.calibrationVolumeResult.create.mockImplementation(({ data }) => Promise.resolve({ id: `volume-${data.rangeThresholdLimitId}`, ...data }));
    tx.calibrationLot.createManyAndReturn.mockImplementation(({ data }) =>
      Promise.resolve(data.map((row) => ({ id: `lot-${row.lotNo}`,...row }))));
    tx.asset.update.mockResolvedValue({ id: 'asset',progress: 'in_progress' });
    if (auditFails) tx.auditLog.createMany.mockRejectedValue(new Error('Audit insert failed'));

    const result = startSession(actor,'asset',{ labDimensionId: labId,nextCalibrationMonths: 12,oneDispensingPerChannel: true },'request');
    if (auditFails) await expect(result).rejects.toThrow('Audit insert failed');
    else await expect(result).resolves.toEqual({ id: 'session' });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);

    expect(tx.calibrationLot.createManyAndReturn).toHaveBeenCalledTimes(3);
    const lots = tx.calibrationLot.createManyAndReturn.mock.calls.flatMap(([args]) => args.data);
    expect(lots).toHaveLength(36);
    expect(lots.map((row) => row.lotNo)).toEqual(Array.from({ length: 36 },(_, index) => index+1));
    expect(tx.auditLog.createMany).toHaveBeenCalledTimes(1);
    const audits = tx.auditLog.createMany.mock.calls[0]?.[0].data;
    expect(audits).toHaveLength(41);
    expect(audits?.find((entry) => entry.entityType==='asset')).toMatchObject({ beforeData: { progress: 'not_started' },afterData: { id: 'asset',progress: 'in_progress' } });
  });

  it('saves ten readings without per-reading snapshot reads and preserves before/after audits', async () => {
    const { tx } = mocks;
    mocks.lockSession.mockResolvedValue({ labDimensionId: labId,assetId: 'asset' });
    tx.labDimension.findUniqueOrThrow.mockResolvedValue({ zCorrectionValue: decimal('1') });
    tx.calibrationLot.findUnique.mockResolvedValue({ id: 'lot',nominalVolumeUl: decimal('100'),calibrationVolumeResultId: 'volume' });
    const before = { id: 'reading-1',readingNo: 1,massG: decimal('0.09') };
    tx.calibrationReading.findMany.mockResolvedValueOnce([before]);
    tx.calibrationReading.upsert.mockImplementation(({ create }) => Promise.resolve({ id: `reading-${create.readingNo}`,...create }));
    mocks.sessionDetail.mockResolvedValue({ saved: true });

    await expect(saveLot(actor,'session',1,{ masses: Array.from({ length: 10 },() => '0.1') },'request')).resolves.toEqual({ saved: true });

    expect(tx.calibrationReading.findMany).toHaveBeenCalledTimes(1);
    expect(tx.calibrationReading.upsert).toHaveBeenCalledTimes(10);
    expect(tx.auditLog.createMany).toHaveBeenCalledTimes(1);
    const audits = tx.auditLog.createMany.mock.calls[0]?.[0].data;
    expect(audits).toHaveLength(10);
    expect(audits?.[0]).toMatchObject({ entityId: 'reading-1',beforeData: { massG: '0.09' },afterData: { massG: '0.1',volumeUl: '100' } });
    expect(audits?.[1]?.beforeData).toBe(Prisma.DbNull);
    expect(tx.calibrationVolumeResult.update).not.toHaveBeenCalled();
  });

  it('propagates a transaction failure without returning success or automatically replaying the transaction', async () => {
    mocks.lockAsset.mockRejectedValue(new Error('Transaction not found'));
    await expect(startSession(actor,'asset',{ labDimensionId: labId,nextCalibrationMonths: 12 },'request')).rejects.toThrow('Transaction not found');
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.auditLog.createMany).not.toHaveBeenCalled();
  });
});
