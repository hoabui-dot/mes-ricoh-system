import { Archive, Boxes, MapPin, Warehouse as WarehouseIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocalizedText } from '@mom-platform/i18n-ui-shared';
import type { LocationNodeType } from './locationHierarchy.types';

const iconByType = {
  warehouse: WarehouseIcon,
  zone: Boxes,
  storage_location: MapPin,
  work_center_staging: MapPin,
  bin: Archive,
} as const;

const toneByType = {
  warehouse: 'border-action/30 bg-action/5',
  zone: 'border-border bg-secondary/60',
  storage_location: 'border-border bg-card',
  work_center_staging: 'border-info/30 bg-info/5',
  bin: 'border-border bg-secondary/40',
} as const;

type Props = {
  type: LocationNodeType;
  label: string;
  name?: unknown;
  code?: string | null;
  children?: ReactNode;
  muted?: boolean;
};

export function LocationHierarchyNode({ type, label, name, code, children, muted }: Props) {
  const resolve = useLocalizedText();
  const Icon = iconByType[type];
  const content = <div className={`rounded-md border px-3 py-2 ${toneByType[type]} ${muted ? 'opacity-75' : ''}`}><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</div><div className="mt-1 text-sm font-semibold text-foreground">{resolve(name as any) || '-'}</div>{code ? <div className="font-mono text-[11px] text-muted-foreground">{code}</div> : null}{children}</div>;
  return content;
}
