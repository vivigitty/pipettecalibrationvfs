import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { querySchema, type Resource } from '@/schemas/resources';

export async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    // maxWait: with one pooled connection per instance, starting the transaction may wait for a concurrent request.
    return await db.$transaction(work, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 15000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2028') {
      logger.error({ err: error,code: 'TRANSACTION_INTERRUPTED',durationMs: Date.now()-startedAt,timeoutMs: 15000 },'Database transaction interrupted; not automatically retried');
    }
    throw error;
  }
}
export const inventoryDb = db;

/** Every word of the search must match at least one of the fields, so "Gilson 20" finds "Gilson / P20". */
function searchWhere<T>(search: string, match: (contains: { contains: string; mode: 'insensitive' }) => T[]) {
  const words = search.trim().split(/\s+/).filter(Boolean).slice(0,6);
  return words.length ? { AND: words.map((word) => ({ OR: match({ contains: word,mode: 'insensitive' }) })) } : {};
}

export async function listInventory(resource: Resource, query: z.infer<typeof querySchema>) {
  const paging = { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
  switch (resource) {
    case 'customers': {
      const where: Prisma.CustomerWhereInput = { isActive: true, ...searchWhere(query.search,(contains) => [{ customerName: contains },{ department: contains }]) };
      const [data,total] = await db.$transaction([db.customer.findMany({ where, ...paging, orderBy: { customerName: 'asc' } }),db.customer.count({ where })]);
      return { data,meta: { ...query,total } };
    }
    case 'ranges': {
      const where: Prisma.RangeThresholdWhereInput = { isActive: true, ...searchWhere(query.search,(contains) => [{ rangeLabel: contains },{ make: contains },{ model: contains }]) };
      const [data,total] = await db.$transaction([db.rangeThreshold.findMany({ where, ...paging, orderBy: { make: 'asc' } }),db.rangeThreshold.count({ where })]);
      const limits = await db.rangeThresholdLimit.findMany({ where: { rangeThresholdId: { in: data.map((row) => row.id) } }, orderBy: { testPointPct: 'asc' } });
      return { data: data.map((row) => ({ ...row,limits: limits.filter((limit) => limit.rangeThresholdId===row.id) })),meta: { ...query,total } };
    }
    case 'assets': return listAssets(query);
    case 'instruments': {
      const where: Prisma.InstrumentWhereInput = { isActive: true, ...searchWhere(query.search,(contains) => [{ makeModel: contains },{ serialNumber: contains }]),
        ...(query.instrumentType ? { instrumentType: query.instrumentType } : {}),
        ...(query.validOn ? { calibrationDueDate: { gte: new Date(query.validOn) } } : {}) };
      const [data,total,masters] = await db.$transaction([db.instrument.findMany({ where,...paging,orderBy: { calibrationDueDate: 'desc' } }),db.instrument.count({ where }),db.masterInstrument.findMany()]);
      return { data: data.map((row) => ({ ...row,isMaster: masters.some((master) => master.instrumentId===row.id) })),meta: { ...query,total } };
    }
    case 'lab-dimensions': {
      const where = query.processDate ? { processDate: new Date(query.processDate) } : {};
      const [data,total] = await db.$transaction([db.labDimension.findMany({ where,...paging,orderBy: { createdAt: 'desc' } }),db.labDimension.count({ where })]);
      return { data,meta: { ...query,total } };
    }
    case 'users': {
      const where: Prisma.UserWhereInput = searchWhere(query.search,(contains) => [{ email: contains },{ displayName: contains }]);
      const [data,total] = await db.$transaction([db.user.findMany({ where,...paging,orderBy: [{ isActive: 'asc' }, { createdAt: 'desc' }] }),db.user.count({ where })]);
      return { data,meta: { ...query,total } };
    }
  }
}

async function listAssets(query: z.infer<typeof querySchema>) {
  const where: Prisma.AssetWhereInput = {
    ...searchWhere(query.search,(contains) => [{ inventoryNumber: contains },{ serialNumber: contains },{ invoiceNumber: contains }]),
    ...(query.progress ? { progress: query.progress } : {}), ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.dueDate ? { sessions: { some: { dueDate: { lte: new Date(query.dueDate) } } } } : {}),
  };
  const [data,total] = await db.$transaction([db.asset.findMany({ where,skip: (query.page-1)*query.pageSize,take: query.pageSize,orderBy: { createdAt: 'desc' },include: { assignedLab: { select: { processDate: true } },sessions: { select: { id: true,status: true,finalStatus: true,processDate: true,sessionNo: true },orderBy: { sessionNo: 'desc' },take: 1 } } }),db.asset.count({ where })]);
  const [customers,ranges] = await Promise.all([db.customer.findMany({ where: { id: { in: data.map((row) => row.customerId) } } }),db.rangeThreshold.findMany({ where: { id: { in: data.map((row) => row.rangeThresholdId) } } })]);
  return {
    data: data.map((row) => {
      const latest = row.sessions.at(0);
      return {
        ...row,
        latestSessionId: latest?.status==='completed' && latest.finalStatus==='pass' ? latest.id : null,
        latestProcessDate: latest?.processDate ?? null,
        calibrationDate: row.progress==='not_started' ? row.scheduledCalibrationDate ?? row.assignedLab?.processDate ?? null : latest?.processDate ?? null,
        customerName: customers.find((customer) => customer.id===row.customerId)?.customerName,
        rangeLabel: ranges.find((range) => range.id===row.rangeThresholdId)?.rangeLabel,
        make: ranges.find((range) => range.id===row.rangeThresholdId)?.make,
        model: ranges.find((range) => range.id===row.rangeThresholdId)?.model,
        channelCount: ranges.find((range) => range.id===row.rangeThresholdId)?.channelCount,
        sessionCount: latest?.sessionNo ?? 0,
      };
    }),
    meta: { ...query,total },
  };
}