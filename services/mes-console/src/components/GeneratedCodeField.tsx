import React from 'react';
import { Input } from './ui';

export function GeneratedCodeField({ label, value, preview, helper }: { label: string; value?: string; preview?: string; helper?: string }) {
  return <label className="block space-y-1"><span className="text-sm font-medium text-foreground">{label}</span><Input value={value || preview || ''} readOnly aria-readonly="true" className="bg-surface-subtle font-mono" />{helper ? <span className="block text-xs text-muted-foreground">{helper}</span> : null}</label>;
}
