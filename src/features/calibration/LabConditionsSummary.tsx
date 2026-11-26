'use client';

import { useQuery } from '@tanstack/react-query';
import { rowSchema } from '@/schemas/resources';
import { api,text } from '@/features/shared/api';
import { useMasterInstruments } from '@/features/shared/master-instruments';

/** The selected environmental condition, shown as its measurement devices and its recorded environment. */
export function LabConditionsSummary({ id }: { id: string }) {
  const query = useQuery({ queryKey: ['lab-dimensions','detail',id],queryFn: async () => rowSchema.parse(await api(`lab-dimensions/${id}`)) });
  const masters = useMasterInstruments();
  if (query.isPending) return <p role="status">Loading environmental condition...</p>;
  if (query.isError) return <p role="alert" className="field-error">{query.error.message}</p>;
  const lab = query.data;
  const equipment = (key: string, type: 'balance' | 'air_thermometer' | 'water_thermometer') => {
    const isMaster = Boolean(text(lab[key],'id')) && text(lab[key],'id')===masters.masterId(type);
    return `${text(lab[key],'makeModel')} / ${text(lab[key],'serialNumber')} / Due ${text(lab[key],'calibrationDueDate').slice(0,10)}${isMaster ? ' (master)' : ''}`;
  };
  const devices = [['Balance',equipment('balance','balance')],['Air thermometer',equipment('air','air_thermometer')],['Water thermometer',equipment('water','water_thermometer')]];
  const environment = [
    ['Calibration date',text(lab,'processDate').slice(0,10)],['Service mode',text(lab,'serviceMode')],
    ['DD water temperature (C)',text(lab,'ddWaterTempC')],['Room temperature (C)',text(lab,'roomTempC')],
    ['Humidity (%)',text(lab,'humidityPct')],['Air pressure (hPa)',text(lab,'airPressureHpa')],['Z correction (uL/mg)',text(lab,'zCorrectionValue')],
  ];
  return <section aria-label="Selected environmental condition" className="lab-summary">
    <div><h3>Measurement devices</h3><dl className="asset-facts">{devices.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
    <div><h3>Environment condition</h3><dl className="asset-facts">{environment.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
  </section>;
}
