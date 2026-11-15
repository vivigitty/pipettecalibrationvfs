'use client';

import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';

export function ExportCsvButton({ isDisabled }: { isDisabled: boolean }) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setIsExporting(true);
    setError('');
    try {
      const response = await fetch('/api/v1/exports/calibrations');
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(problem?.detail || 'Unable to export calibrations');
      }
      const blob = await response.blob();
      const match = (response.headers.get('content-disposition') ?? '').match(/filename="([^"]+)"/i);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match?.[1] ?? 'completed-calibrations.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to export calibrations');
    } finally {
      setIsExporting(false);
    }
  };
  return <>
    <button className="button secondary" type="button" disabled={isDisabled || isExporting} onClick={() => { void run(); }}><FileSpreadsheet size={16} />{isExporting ? 'Exporting...' : 'Export completed (CSV)'}</button>
    {error ? <p role="alert" className="field-error">{error}</p> : null}
  </>;
}