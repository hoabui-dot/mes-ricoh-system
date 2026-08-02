import React, { useState } from 'react';
import { ChevronRight, Factory, Monitor, Network, Wrench, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from './ui';
import { StatusBadge } from './StatusBadge';

type ResourceRow = Record<string, any>;

function displayName(row: ResourceRow, text: (value: unknown) => string) {
  return text(row.name || row.area_name || row.work_center_name || row.workstation_name || row.equipment_name) || row.code || '-';
}

export function ResourceHierarchy({ areas, workCenters, workstations, equipment, text, title }: { areas: ResourceRow[]; workCenters: ResourceRow[]; workstations: ResourceRow[]; equipment: ResourceRow[]; text: (value: unknown) => string; title: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const roots = areas.filter((area) => !area.parent_area_id).sort((a, b) => (a.sequence_no || 0) - (b.sequence_no || 0));
  const children = (parentId: string) => areas.filter((area) => area.parent_area_id === parentId).sort((a, b) => (a.sequence_no || 0) - (b.sequence_no || 0));
  const workCentersFor = (areaId: string) => workCenters.filter((row) => row.area_id === areaId);
  const workstationsFor = (workCenterId: string) => workstations.filter((row) => row.work_center_id === workCenterId);
  const equipmentFor = (workCenterId: string) => equipment.filter((row) => row.work_center_id === workCenterId);
  const node = (row: ResourceRow, kind: 'area' | 'work-center' | 'workstation' | 'equipment', depth: number) => {
    const route = kind === 'area' ? `/master-data/production-areas/${row.master_id}` : `/master-data/${kind === 'work-center' ? 'work-centers' : kind === 'workstation' ? 'workstations' : 'machines'}/${row.master_id}`;
    const Icon = kind === 'area' ? Factory : kind === 'work-center' ? Network : kind === 'workstation' ? Monitor : Wrench;
    const key = `${kind}-${row.master_id}`; const isExpanded = expanded.has(key);
    return <React.Fragment key={key}><div role="button" tabIndex={0} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }); } }} className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm hover:bg-hover" style={{ paddingLeft: `${12 + depth * 22}px` }}><ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} /><Icon className="h-4 w-4 text-action" /><span className="min-w-0 flex-1 truncate font-medium text-foreground">{displayName(row, text)} <span className="font-mono text-xs text-muted-foreground">{row.code}</span></span><StatusBadge status={row.execution_status || (row.active_flag === false ? 'Inactive' : row.lifecycle_status || 'Active')} /><Link to={route} onClick={(event) => event.stopPropagation()} aria-label="Open resource detail" className="rounded p-1 text-muted-foreground hover:bg-hover hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></Link></div>{kind === 'area' && isExpanded ? <>{children(row.master_id).map((child) => node(child, 'area', depth + 1))}{workCentersFor(row.master_id).map((workCenter) => <React.Fragment key={workCenter.master_id}>{node(workCenter, 'work-center', depth + 1)}{workstationsFor(workCenter.master_id).map((workstation) => node(workstation, 'workstation', depth + 2))}{equipmentFor(workCenter.master_id).map((item) => node(item, 'equipment', depth + 2))}</React.Fragment>)}</> : null}</React.Fragment>;
  };
  return <Card className="overflow-hidden p-0"><div className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</div>{roots.length ? roots.map((root) => node(root, 'area', 0)) : <div className="px-4 py-5 text-sm text-muted-foreground">-</div>}</Card>;
}
