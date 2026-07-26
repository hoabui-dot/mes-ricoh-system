import React from 'react';
import { Input } from './ui';

export function EffectivePeriodField({ from, to, onFromChange, onToChange, labels }: { from?: string; to?: string; onFromChange: (value: string) => void; onToChange: (value: string) => void; labels: { from: string; to: string } }) {
  return <div className="grid gap-3 md:grid-cols-2"><label className="block space-y-1"><span className="text-sm font-medium">{labels.from}</span><Input type="datetime-local" required value={from?.slice(0, 16) || ''} onChange={(event) => onFromChange(event.target.value)} /></label><label className="block space-y-1"><span className="text-sm font-medium">{labels.to}</span><Input type="datetime-local" value={to?.slice(0, 16) || ''} onChange={(event) => onToChange(event.target.value)} /></label></div>;
}
