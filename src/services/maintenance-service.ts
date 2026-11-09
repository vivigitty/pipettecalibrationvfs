import { parseRange } from '@/domain/range';
import { authorizeWrite,type Actor } from '@/lib/rbac';
import { ConflictError,NotFoundError,ValidationError } from '@/lib/errors';
import { transaction } from '@/repositories/inventory';
import { recordAudit } from '@/repositories/audit';
import { rangeSchema,userUpdateSchema } from '@/schemas/resources';

export async function updateUser(actor: Actor, id: string, raw: unknown, requestId: string) {
  authorizeWrite(actor,true);
  const input = userUpdateSchema.parse(raw);
  if (id===actor.id && (input.isActive===false || (input.role && input.role!=='admin'))) throw new ConflictError('You cannot remove your own administrator access');
  return transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundError();
    if (before.role==='admin' && before.isActive && (input.isActive===false || (input.role && input.role!=='admin')) && await tx.user.count({ where: { role: 'admin',isActive: true } })<=1) throw new ConflictError('At least one active administrator is required');
    const user = await tx.user.update({ where: { id },data: {
      ...(input.role!==undefined ? { role: input.role } : {}),
      ...(input.isActive!==undefined ? { isActive: input.isActive } : {}),
      ...(input.displayName!==undefined ? { displayName: input.displayName } : {}),
    } });
    await recordAudit(tx,actor,requestId,'user',id,'update',before); return user;
  });
}

export async function updateLimits(actor: Actor, id: string, raw: unknown, requestId: string) {
  authorizeWrite(actor,true);
  const { limits } = rangeSchema.pick({ limits: true }).parse(raw);
  return transaction(async (tx) => {
    const range = await tx.rangeThreshold.findUnique({ where: { id } });
    if (!range) throw new NotFoundError();
    const plan = parseRange(range.rangeLabel,range.channel);
    if (limits.length!==plan.timesToTest || plan.points.some((point) => limits.filter((limit) => limit.testPointPct===point.pct).length!==1)) throw new ValidationError('Provide one limit pair for every planned test point');
    for (const limit of limits) {
      const point = plan.points.find((candidate) => candidate.pct===limit.testPointPct);
      if (!point) throw new ValidationError('Invalid test point');
      const key = { rangeThresholdId: id,testPointPct: limit.testPointPct };
      const before = await tx.rangeThresholdLimit.findUnique({ where: { rangeThresholdId_testPointPct: key } });
      if (before && !before.nominalVolumeUl.eq(point.volume.toString())) throw new ConflictError('Existing nominal volume is inconsistent; administrator review required');
      const row = await tx.rangeThresholdLimit.upsert({ where: { rangeThresholdId_testPointPct: key },create: { ...limit,rangeThresholdId: id,nominalVolumeUl: point.volume.toString(),capturedBy: actor.id },update: { inaccuracyLimitPct: limit.inaccuracyLimitPct,imprecisionLimitPct: limit.imprecisionLimitPct,capturedBy: actor.id,capturedAt: new Date() } });
      await recordAudit(tx,actor,requestId,'range_threshold_limit',row.id,'update_limits',before ?? undefined);
    }
    return { id,isReady: true };
  });
}