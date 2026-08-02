import React from 'react';
import { Clock, GitBranch } from 'lucide-react';
import { Card } from '../ui/card';

export function BaseDependencyPanel({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return <Card className="space-y-3 border-border bg-surface-subtle p-4"><div className="flex items-center gap-2 font-semibold text-foreground"><GitBranch className="h-4 w-4 text-action" />{title}</div>{children}</Card>;
}

export function BaseAuditTimeline({ title, events }: { title: React.ReactNode; events: Array<{ id: string; label: React.ReactNode; at?: string; actor?: string }> }) {
  return <Card className="space-y-3 border-border bg-surface-subtle p-4"><div className="flex items-center gap-2 font-semibold text-foreground"><Clock className="h-4 w-4 text-action" />{title}</div><ol className="space-y-2">{events.map((event) => <li key={event.id} className="grid gap-1 border-l border-border pl-3 text-sm"><span className="font-medium text-foreground">{event.label}</span><span className="text-xs text-muted-foreground">{[event.at, event.actor].filter(Boolean).join(' · ')}</span></li>)}</ol></Card>;
}
