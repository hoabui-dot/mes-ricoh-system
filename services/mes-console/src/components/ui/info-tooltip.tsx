import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from '../../lib/utils';

export function InfoTooltip({ content, label }: { content: string; label: string }) {
  return <FieldHelpTooltip label={label} title={label} summary={content} />;
}

export function FieldHelpPopover({ label, title, content }: { label: string; title: string; content: string }) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 120); };
  return <Popover open={open} onOpenChange={(next) => { cancelClose(); setOpen(next); }}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={label} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-action focus-visible:ring-2 focus-visible:ring-action" onPointerEnter={() => { cancelClose(); setOpen(true); }} onPointerLeave={scheduleClose} onFocus={() => setOpen(true)}>
        <Info className="h-4 w-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" className="z-[210] w-[min(26rem,calc(100vw-2rem))] whitespace-pre-line bg-surface-elevated p-4 text-sm leading-5 text-foreground opacity-100" onPointerEnter={cancelClose} onPointerLeave={scheduleClose}>
      <p className="mb-2 font-semibold">{title}</p>
      <p>{content}</p>
    </PopoverContent>
  </Popover>;
}

export function FieldHelpTooltip({ label, title, summary, sections = [], example, important, className }: {
  label: string; title: string; summary: string; sections?: Array<{ heading: string; body: string }>; example?: string; important?: string; className?: string;
}) {
  const resolvedSections = sections.length ? sections : [{ heading: 'What it means', body: summary }];
  return <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-action focus-visible:ring-2 focus-visible:ring-action', className)}>
          <Info className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="w-[min(24rem,calc(100vw-2rem))] whitespace-normal bg-surface-elevated p-4 text-left text-foreground opacity-100">
        <div className="space-y-3">
          <p className="font-semibold">{title}</p>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{resolvedSections[0].heading}</p><p className="mt-1 leading-5">{resolvedSections[0].body}</p></div>
          {resolvedSections.slice(1).map((section) => <div key={section.heading}><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.heading}</p><p className="mt-1 leading-5">{section.body}</p></div>)}
          {example ? <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Example</p><p className="mt-1 leading-5">{example}</p></div> : null}
          {important ? <div className="border-l-2 border-action pl-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Important</p><p className="mt-1 leading-5">{important}</p></div> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>;
}
