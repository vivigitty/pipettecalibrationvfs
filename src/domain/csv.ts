// Spreadsheet apps execute cells starting with these characters (CSV injection).
// Phone-like or numeric values that merely start with +/- are left untouched.
function isFormulaLike(text: string) {
  if (/^[=@\t\r]/.test(text)) return true;
  return /^[+-]/.test(text) && !/^[+-][\d\s().-]*$/.test(text);
}

export function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && isFormulaLike(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]) {
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}