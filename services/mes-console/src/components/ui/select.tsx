import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';

const EMPTY_VALUE = '__empty__';

export type SelectBaseOption = {
  value: string;
  label: React.ReactNode;
  secondaryLabel?: React.ReactNode;
  disabled?: boolean;
};

export type SelectBaseProps = {
  value?: string | null;
  onValueChange?: (value: string) => void;
  options: SelectBaseOption[];
  placeholder?: React.ReactNode;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  name?: string;
  required?: boolean;
  'data-testid'?: string;
  'aria-label'?: string;
};

export function SelectBase({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  disabled,
  className,
  contentClassName,
  name,
  required,
  'data-testid': testId,
  'aria-label': ariaLabel,
}: SelectBaseProps) {
  const normalizedValue = value ? value : EMPTY_VALUE;

  const control = (
    <SelectPrimitive.Root
      value={normalizedValue}
      onValueChange={(next) => onValueChange?.(next === EMPTY_VALUE ? '' : next)}
      disabled={disabled}
      name={name}
      required={required}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        data-testid={testId}
        className={cn(
          'flex h-11 w-full items-center justify-between rounded-md border border-input bg-input px-3 text-left text-sm text-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn('z-[200] isolate max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-slate-700 bg-slate-900 text-slate-100 shadow-xl opacity-100', contentClassName)}
        >
          <SelectPrimitive.Viewport className="bg-slate-900 p-1">
            {options.map((option) => {
              const itemValue = option.value || EMPTY_VALUE;
              return (
                <SelectPrimitive.Item
                  key={`${itemValue}-${String(option.label)}`}
                  value={itemValue}
                  disabled={option.disabled}
                  className="relative flex h-9 cursor-default select-none items-center rounded-sm py-2 pl-8 pr-3 text-sm outline-none focus:bg-slate-800 data-[state=checked]:bg-amber-500/15 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <SelectPrimitive.ItemIndicator className="absolute left-2 flex h-4 w-4 items-center justify-center text-amber-300">
                    <Check className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText>
                    <span className={cn('block leading-5', option.secondaryLabel && 'text-foreground')}>{option.label}</span>
                    {option.secondaryLabel && <span className="block text-xs italic leading-4 text-muted-foreground">{option.secondaryLabel}</span>}
                  </SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              );
            })}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );

  return label ? <label className="block space-y-1"><span className="block text-sm font-medium text-foreground">{label}</span>{control}</label> : control;
}
