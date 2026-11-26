import { z } from 'zod';

const instrumentSchema = z.object({ makeModel: z.string(),serialNumber: z.string(),calibrationDueDate: z.string() });
export const certificateSchema = z.object({
  inventoryNumber: z.string(),rangeLabel: z.string(),customerName: z.string(),address1: z.string(),address2: z.string().nullable(),
  department: z.string(),make: z.string(),model: z.string(),serialNumber: z.string(),customerAssetId: z.string().nullable(),invoiceNumber: z.string().nullable(),channel: z.string(),channelCount: z.number().int().positive().default(1),
  contactName: z.string().nullable(),email: z.string().nullable(),phone1: z.string().nullable(),phone2: z.string().nullable(),
  serviceMode: z.string(),sessionNo: z.number().int().positive(),reminderDate: z.string(),
  processDate: z.string(),dueDate: z.string(),servicedBy: z.string(),ddWaterTempC: z.string(),roomTempC: z.string(),humidityPct: z.string(),
  airPressureHpa: z.string(),zCorrectionValue: z.string(),balance: instrumentSchema,air: instrumentSchema,water: instrumentSchema,
  damagedParts: z.string(),replacedParts: z.string(),logoUrl: z.string().nullable(),signatureUrl: z.string().nullish().transform((value) => value ?? null),signatureDate: z.string().nullish().transform((value) => value ?? null),footer: z.string(),
  volumes: z.array(z.object({ nominalVolumeUl: z.string(),inaccuracyActualPct: z.string(),imprecisionActualPct: z.string(),inaccuracyLimitPct: z.string(),imprecisionLimitPct: z.string(),
    readings: z.array(z.object({ massG: z.string(),volumeUl: z.string() })) })),
});
export type CertificateData = z.infer<typeof certificateSchema>;