import React from 'react';
import * as Switch from '@radix-ui/react-switch';

export function StatusSwitchField({ checked, onCheckedChange, label, activeLabel, inactiveLabel }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label: string; activeLabel: string; inactiveLabel: string }) {
  return <div className="flex items-center justify-between rounded-md border border-border bg-surface-subtle px-3 py-2">
    <div><div className="text-sm font-medium text-foreground">{label}</div><div className="text-xs text-muted-foreground">{checked ? activeLabel : inactiveLabel}</div></div>
    <Switch.Root type="button" checked={checked} onCheckedChange={onCheckedChange} aria-label={label} className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${checked ? 'bg-action' : 'bg-muted'}`}>
      <Switch.Thumb className={`block h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </Switch.Root>
  </div>;
}
