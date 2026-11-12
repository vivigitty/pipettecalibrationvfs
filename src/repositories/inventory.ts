import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { querySchema, type Resource } from '@/schemas/resources';

export const transaction = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => db.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000 });
export const inventoryDb = db;

export async function listInventory(resource: Resource, query: z.infer<typeof querySchema>) {
  const paging = { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
  const contains = { contains: query.search, mode: 'insensitive' as const };
  switch (resource) {
    case 'customers': {
      const where = { isActive: true, OR: [{ customerName: contains }, { department: contains }] };
      const [data,total] = await db.$transaction([db.customer.findMany({ where, ...paging, orderBy: { customerName: 'asc' } }),db.customer.count({ where })]);
      return { data,meta: { ...query,total } };
    }
    case 'ranges': {
      const where = { isActive: true, OR: [{ rangeLabel: contains },{ make: contains },{ model: contains }] };
      const [data,total] = await db.$transaction([db.rangeThreshold.findMany({ where, ...paging, orderBy: { make: 'asc' } }),db.rangeThreshold.count({ where })]);
      const limits = await db.rangeThresholdLimit.findMany({ where: { rangeThresholdId: { in: data.map((row) => row.id) } }, orderBy: { testPointPct: 'asc' } });
      return { data: data.map((row) => ({ ...row,limits: limits.filter((limit) => limit.rangeThresholdId===row.id) })),meta: { ...query,total } };
    }
    case 'assets': return listAssets(query);
    case 'instruments': {
      const where = { isActive: true, OR: [{ makeModel: contains },{ serialNumber: contains }] };
      const [data,total] = await db.$transaction([db.instrument.findMany({ where,...paging,orderBy: { calibrationDueDate: 'desc' } }),db.instrument.count({ where })]);
      return { data,meta: { ...query,total } };
    }
    case 'lab-dimensions': {
      const [data,total] = await db.$transaction([db.labDimension.findMany({ ...paging,orderBy: { createdAt: 'desc' } }),db.labDimension.count()]);
      return { data,meta: { ...query,total } };
    }
    case 'users': {
      const where = { OR: [{ email: contains }, { displayName: contains }] };
      const [data,total] = await db.$transaction([db.user.findMany({ where,...paging,orderBy: [{ isActive: 'asc' }, { createdAt: 'desc' }] }),db.user.count({ where })]);
      return { data,meta: { ...query,total } };
    }
  }
}

async function listAssets(query: z.infer<typeof querySchema>) {
  const contains = { contains: query.search,mode: 'insensitive' as const };
  const where: Prisma.AssetWhereInput = {
    OR: [{ inventoryNumber: contains },{ serialNumber: contains },{ invoiceNumber: contains }],
    ...(query.progress ? { progress: query.progress } : {}), ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.dueDate ? { sessions: { some: { dueDate: { lte: new Date(query.dueDate) } } } } : {}),
  };
  const [data,total] = await db.$transaction([db.asset.findMany({ where,skip: (query.page-1)*query.pageSize,take: query.pageSize,orderBy: { createdAt: 'desc' },include: { sessions: { select: { id: true,status: true,finalStatus: true,processDate: true,sessionNo: true },orderBy: { sessionNo: 'desc' },take: 1 } } }),db.asset.count({ where })]);
  const [customers,ranges] = await Promise.all([db.customer.findMany({ where: { id: { in: data.map((row) => row.customerId) } } }),db.rangeThreshold.findMany({ where: { id: { in: data.map((row) => row.rangeThresholdId) } } })]);
  return {
    data: data.map((row) => {
      const latest = row.sessions.at(0);
      return {
        ...row,
        latestSessionId: latest?.status==='completed' && latest.finalStatus==='pass' ? latest.id : null,
        latestProcessDate: latest?.processDate ?? null,
        customerName: customers.find((customer) => customer.id===row.customerId)?.customerName,
        rangeLabel: ranges.find((range) => range.id===row.rangeThresholdId)?.rangeLabel,
        make: ranges.find((range) => range.id===row.rangeThresholdId)?.make,
      };
    }),
    meta: { ...query,total },
  };
}