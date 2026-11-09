import { addMonths, format, isValid, parseISO, subDays } from 'date-fns';

/** FR-10: add calendar months (clamped at month-end), then subtract one day. */
export function calibrationDates(processDate: string, months: number) {
  const process = parseISO(processDate);
  if (!isValid(process) || format(process, 'yyyy-MM-dd') !== processDate || !Number.isInteger(months) || months < 1 || months > 60) throw new Error('Invalid calibration interval');
  const due = subDays(addMonths(process, months), 1);
  return { dueDate: format(due, 'yyyy-MM-dd'), reminderDate: format(subDays(due, 30), 'yyyy-MM-dd') };
}