import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Actor } from '@/lib/rbac';

const entitySchema = z.enum(['customer','range_threshold','range_threshold_limit','asset','instrument','lab_dimension','user','calibration_session','calibration_lot','calibration_reading','calibration_volume_result','asset_damage','asset_certification']);
const snapshotSchema = z.record(z.string(),z.json());

export type AuditEntry = {
  entityType: z.infer<typeof entitySchema>;
  entityId: string;
  action: string;
  after: unknown;
  before?: unknown;
};

export async function recordAudits(tx: Prisma.TransactionClient, actor: Actor, requestId: string, entries: AuditEntry[]) {
  if (entries.length===0) return;
  await tx.auditLog.createMany({ data: entries.map((entry) => ({
    actorUserId: actor.id,requestId,entityType: entitySchema.parse(entry.entityType),entityId: entry.entityId,action: entry.action,
    afterData: snapshotSchema.parse(JSON.parse(JSON.stringify(entry.after))),
    beforeData: entry.before===undefined ? Prisma.DbNull : snapshotSchema.parse(JSON.parse(JSON.stringify(entry.before))),
  })) });
}

export async function recordAudit(tx: Prisma.TransactionClient, actor: Actor, requestId: string, entityType: z.infer<typeof entitySchema>, entityId: string, action: string, before?: unknown, after?: unknown) {
  const where = { id: entityId };
  const readers = {
    customer: () => tx.customer.findUnique({ where }),range_threshold: () => tx.rangeThreshold.findUnique({ where }),
    range_threshold_limit: () => tx.rangeThresholdLimit.findUnique({ where }),asset: () => tx.asset.findUnique({ where }),
    instrument: () => tx.instrument.findUnique({ where }),lab_dimension: () => tx.labDimension.findUnique({ where }),user: () => tx.user.findUnique({ where }),
    calibration_session: () => tx.calibrationSession.findUnique({ where }),calibration_lot: () => tx.calibrationLot.findUnique({ where }),
    calibration_reading: () => tx.calibrationReading.findUnique({ where }),calibration_volume_result: () => tx.calibrationVolumeResult.findUnique({ where }),
    asset_damage: () => tx.assetDamage.findUnique({ where }),asset_certification: () => tx.assetCertification.findUnique({ where }),
  };
  const snapshot = after ?? await readers[entitySchema.parse(entityType)]();
  if (!snapshot) throw new Error('Audit snapshot missing');
  const afterData = snapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
  const beforeData = before===undefined ? Prisma.DbNull : snapshotSchema.parse(JSON.parse(JSON.stringify(before)));
  await tx.auditLog.create({ data: { actorUserId: actor.id,requestId,entityType,entityId,action,afterData,beforeData } });
}