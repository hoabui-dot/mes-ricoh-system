import React from 'react';
import { Info } from 'lucide-react';

export function InfoTooltip({ content, label }: { content: string; label: string }) {
  return <span className="group relative inline-flex"><button type="button" aria-label={label} className="rounded-full p-0.5 text-muted-foreground outline-none hover:text-action focus-visible:ring-2 focus-visible:ring-action"><Info className="h-4 w-4" /></button><span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-72 rounded-md border border-border bg-surface px-3 py-2 text-left text-xs font-normal text-foreground shadow-xl group-hover:block group-focus-within:block">{content}</span></span>;
}
