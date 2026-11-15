import { toCsv } from '@/domain/csv';
import { EXPORT_HEADERS, toExportRow, type ExportSession } from '@/domain/calibration-export';
import { ForbiddenError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { Actor } from '@/lib/rbac';
import { listCompletedSessions, type CompletedSession } from '@/repositories/export';
import { exportQuerySchema } from '@/schemas/resources';

const BATCH_SIZE = 200;

function toExportSession(s: CompletedSession): ExportSession {
  return {
    inventoryNumber: s.asset.inventoryNumber, serialNumber: s.asset.serialNumber, customerAssetId: s.asset.customerAssetId,
    customerName: s.asset.customer.customerName, address1: s.asset.customer.address1, address2: s.asset.customer.address2,
    email: s.asset.customer.email, phone1: s.asset.customer.phone1, phone2: s.asset.customer.phone2,
    contactName: s.asset.customer.contactName, department: s.asset.customer.department,
    rangeLabel: s.asset.range.rangeLabel, channel: s.asset.range.channel, make: s.asset.range.make, model: s.asset.range.model,
    serviceMode: s.lab.serviceMode, finalStatus: s.finalStatus, calibratedBy: s.lab.calibrator.displayName,
    processDate: s.processDate, dueDate: s.dueDate, reminderDate: s.reminderDate,
    ddWaterTempC: s.lab.ddWaterTempC.toString(), roomTempC: s.lab.roomTempC.toString(), humidityPct: s.lab.humidityPct.toString(),
    airPressureHpa: s.lab.airPressureHpa.toString(), zCorrectionValue: s.lab.zCorrectionValue.toString(),
    balance: s.lab.balance, air: s.lab.air, water: s.lab.water, damages: s.asset.damages,
    volumes: s.volumes.map((volume) => ({
      nominalVolumeUl: volume.nominalVolumeUl.toString(),
      massesG: s.lots.filter((lot) => lot.calibrationVolumeResultId === volume.id)
        .flatMap((lot) => lot.readings.map((reading) => reading.massG.toString())),
    })),
  };
}

/** Reusable by a future scheduler: pass { from, to } for a monthly window. */
export async function exportCompletedCalibrations(actor: Actor, raw: unknown) {
  if (actor.isPreview) throw new ForbiddenError('No exports are generated in preview mode');
  const query = exportQuerySchema.parse(raw);
  const filter = { ...(query.from ? { from: new Date(query.from) } : {}), ...(query.to ? { to: new Date(query.to) } : {}) };
  const rows: ReturnType<typeof toExportRow>[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await listCompletedSessions(filter, cursor, BATCH_SIZE);
    rows.push(...page.map((session) => toExportRow(toExportSession(session))));
    const last = page.at(-1);
    if (!last || page.length < BATCH_SIZE) break;
    cursor = last.id;
  }
  logger.info({ code: 'CALIBRATION_EXPORT', actorId: actor.id, rowCount: rows.length }, 'Completed calibrations exported');
  const filename = `completed-calibrations_${new Date().toISOString().slice(0, 10)}.csv`;
  // BOM so Excel reads µ and other non-ASCII characters as UTF-8.
  return new Response(`\uFEFF${toCsv(EXPORT_HEADERS, rows)}`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store' },
  });
}