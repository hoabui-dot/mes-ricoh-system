import React from 'react';

export function ResourceHierarchyContext({ factory, shopfloor, workCenter, workstation, label = 'Hierarchy' }: { factory?: string; shopfloor?: string; workCenter?: string; workstation?: string; label?: string }) {
  return <div className="rounded-md border border-border bg-surface-subtle p-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">{label}:</span> {factory || '-'} <span className="mx-1">→</span> {shopfloor || '-'} <span className="mx-1">→</span> {workCenter || '-'}{workstation ? <><span className="mx-1">→</span> {workstation}</> : null}</div>;
}
