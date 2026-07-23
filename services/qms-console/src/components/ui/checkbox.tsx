import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Checkbox({ checked, onCheckedChange, id, label }: { checked: boolean; onCheckedChange: (checked: boolean) => void; id?: string; label?: string }) {
  return <label htmlFor={id} className="flex items-center gap-2 text-sm"><CheckboxPrimitive.Root id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} className={cn('flex h-4 w-4 items-center justify-center rounded-sm border border-input bg-card text-action shadow-sm focus:outline-none focus:ring-2 focus:ring-ring data-[state=checked]:bg-action data-[state=checked]:text-action-foreground')}><CheckboxPrimitive.Indicator><Check className="h-3 w-3" /></CheckboxPrimitive.Indicator></CheckboxPrimitive.Root>{label}</label>;
}
