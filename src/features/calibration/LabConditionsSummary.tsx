'use client';

import { useQuery } from '@tanstack/react-query';
import { rowSchema } from '@/schemas/resources';
import { api,text } from '@/features/shared/api';

export function LabConditionsSummary({ id }: { id: string }) {
  const query = useQuery({ queryKey: ['lab-dimensions','detail',id],queryFn: async () => rowSchema.parse(await api(`lab-dimensions/${id}`)) });
  if (query.isPending) return <p role="status">Loading lab conditions...</p>;
  if (query.isError) return <p role="alert" className="field-error">{query.error.message}</p>;
  const lab = query.data;
  const equipment = (key: string) => `${text(lab[key],'makeModel')} / ${text(lab[key],'serialNumber')} / Due ${text(lab[key],'calibrationDueDate').slice(0,10)}`;
  const facts = [
    ['Process date',text(lab,'processDate').slice(0,10)],['Service mode',text(lab,'serviceMode')],
    ['Balance',equipment('balance')],['Air thermometer',equipment('air')],['Water thermometer',equipment('water')],
    ['DD water temperature (C)',text(lab,'ddWaterTempC')],['Room temperature (C)',text(lab,'roomTempC')],
    ['Humidity (%)',text(lab,'humidityPct')],['Air pressure (hPa)',text(lab,'airPressureHpa')],['Z correction (uL/mg)',text(lab,'zCorrectionValue')],
  ];
  return <section aria-label="Selected lab conditions"><h3>Selected lab sitting</h3><dl className="asset-facts">{facts.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}
