import Decimal from 'decimal.js';
import { z } from 'zod';

const text = (max = 100) => z.string().trim().min(1).max(max);
const optionalText = (max = 100) => z.string().trim().max(max).nullish().transform((value) => value || null);
export const decimalSchema = z.string().regex(/^\d+(\.\d+)?$/, 'Enter a positive decimal').max(30).pipe(z.string().refine((value) => new Decimal(value).gt(0), 'Must be greater than zero'));
const boundedDecimal = (min: string, max: string) => z.string().regex(/^\d+(\.\d+)?$/).max(30).pipe(z.string().refine((value) => new Decimal(value).gte(min) && new Decimal(value).lte(max), `Must be between ${min} and ${max}`));
export const dateSchema = z.iso.date();
export const idSchema = z.uuid();
export const resourceSchema = z.enum(['customers','ranges','assets','instruments','lab-dimensions','users']);
export type Resource = z.infer<typeof resourceSchema>;
export const customerSchema = z.strictObject({ customerName: text(200), department: text(150), address1: text(250), address2: optionalText(250), email: z.email(), phone1: text(30), phone2: optionalText(30), contactName: text(150) });
export const rangeSchema = z.strictObject({ rangeLabel: text(30), channel: z.enum(['single','eight','twelve','sixteen','twenty_four']), make: text(), model: text(), limits: z.array(z.strictObject({ testPointPct: z.number().int().min(1).max(100), inaccuracyLimitPct: decimalSchema, imprecisionLimitPct: decimalSchema })).min(1).max(3) });
export const validityMonthsSchema = z.coerce.number().int().min(1).max(60);
export const assetSchema = z.strictObject({ customerId: idSchema, rangeThresholdId: idSchema, serialNumber: text(), inventoryNumber: text(), customerAssetId: optionalText(), invoiceNumber: optionalText() });
export const assetBatchSchema = z.strictObject({ assets: z.array(assetSchema).min(1).max(50) });
/** Bulk assignment of calibration validity (months until the next calibration is due) from the calibration jobs list. */
export const assetValiditySchema = z.strictObject({ assetIds: z.array(idSchema).min(1).max(500), calibrationValidityMonths: validityMonthsSchema });
/** Re-opens calibrated pipettes as calibration jobs planned for a future date. */
export const recalibrationSchema = z.strictObject({ assetIds: z.array(idSchema).min(1).max(500), scheduledDate: dateSchema, calibrationValidityMonths: validityMonthsSchema.optional() });
export const masterInstrumentSchema = z.strictObject({ instrumentId: idSchema });
/** Data-URL signature image, limited to about 1 MB of image data. */
export const signatureImageSchema = z.string().regex(/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/, 'Upload a PNG, JPEG, GIF or WebP image').max(1000000, 'Signature image must be under 700 KB');
export const userSignatureSchema = z.strictObject({ imageDataUrl: signatureImageSchema });
export const instrumentSchema = z.strictObject({ instrumentType: z.enum(['balance','air_thermometer','water_thermometer']), makeModel: text(150), serialNumber: text(), calibrationDueDate: dateSchema });
export type InstrumentType = z.infer<typeof instrumentSchema>['instrumentType'];
export const labSchema = z.strictObject({ processDate: dateSchema, serviceMode: z.enum(['onsite','offsite']), balanceInstrumentId: idSchema, airInstrumentId: idSchema, waterThermometerInstrumentId: idSchema, ddWaterTempC: boundedDecimal('15','30'), roomTempC: boundedDecimal('15','30'), humidityPct: boundedDecimal('0','100'), airPressureHpa: boundedDecimal('800','1050') });
export const damageSchema = z.strictObject({ observationNotes: text(3000), damagedPartName: text(150), partReplaced: z.boolean(), replacedPartSerialNumber: optionalText(), partCost: z.string().regex(/^\d+(\.\d{1,2})?$/).nullish() }).superRefine((data, ctx) => {
  if (data.partReplaced && (!data.replacedPartSerialNumber || !data.partCost)) ctx.addIssue({ code: 'custom', path: ['replacedPartSerialNumber'], message: 'Replacement serial and cost are required' });
});
export const readingsSchema = z.strictObject({ masses: z.array(decimalSchema).length(10) });
export const lotsReadingsSchema = z.strictObject({ lots: z.array(z.strictObject({ lotNo: z.number().int().min(1).max(36), masses: readingsSchema.shape.masses })).min(1).max(36) });
export const userSchema = z.strictObject({ email: z.email(), displayName: text(120), externalSubject: text(255), role: z.enum(['technician','admin','executive']), isActive: z.boolean().default(true) });
export const userUpdateSchema = z.strictObject({ role: userSchema.shape.role.optional(),isActive: z.boolean().optional(),displayName: userSchema.shape.displayName.optional() }).refine((value) => Object.keys(value).length>0,'Provide at least one change');
export const voidSchema = z.strictObject({ reason: text(2000) });
export const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), search: z.string().max(200).default(''), progress: z.enum(['not_started','in_progress','completed']).optional(), customerId: idSchema.optional(), dueDate: dateSchema.optional(), instrumentType: instrumentSchema.shape.instrumentType.optional(), validOn: dateSchema.optional(), processDate: dateSchema.optional() });
export const rowSchema = z.record(z.string(), z.unknown());
export const listSchema = z.object({ data: z.array(rowSchema), meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }) });
export type Row = z.infer<typeof rowSchema>;
export const exportQuerySchema = z.object({ from: dateSchema.optional(), to: dateSchema.optional() });
export const startSessionSchema = z.strictObject({ labDimensionId: idSchema, oneDispensingPerChannel: z.boolean().default(false), servicedBy: optionalText(120), calibrationValidityMonths: z.union([validityMonthsSchema, z.literal('').transform(() => undefined)]).optional() });