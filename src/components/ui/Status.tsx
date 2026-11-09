import { CheckCircle2,Circle,Clock3,XCircle } from 'lucide-react';

export function Status({ value }: { value: string }) {
  const Icon = value==='pass' || value==='completed' ? CheckCircle2 : value==='fail' ? XCircle : value==='in_progress' ? Clock3 : Circle;
  return <span className={`status status-${value}`}><Icon size={13} aria-hidden="true" />{value.replaceAll('_',' ') || 'pending'}</span>;
}