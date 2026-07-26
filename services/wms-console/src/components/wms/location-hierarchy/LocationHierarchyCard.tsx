import { LocationHierarchyBins } from './LocationHierarchyBins';
import { LocationHierarchyNode } from './LocationHierarchyNode';
import type { LocationHierarchyContext, LocationHierarchyDirection, LocationHierarchyLabels } from './locationHierarchy.types';

type Props = {
  direction: LocationHierarchyDirection;
  context: LocationHierarchyContext;
  labels: LocationHierarchyLabels;
  actualBinId?: string | null;
};

export function LocationHierarchyCard({ direction, context, labels, actualBinId }: Props) {
  const { location, zone, warehouse, bins } = context;
  if (!location) return <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">{labels.unknownLocation}</div>;
  const locationType = location.location_purpose === 'WorkCenterStaging' ? 'work_center_staging' : 'storage_location';
  const locationLabel = locationType === 'work_center_staging' ? labels.workCenterStaging : labels.storageLocation;
  return <section className="rounded-lg border border-border bg-card p-3 shadow-sm" aria-label={locationLabel}><div className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{locationLabel}</div><div className="relative ml-1 space-y-2 border-l-2 border-border pl-3"><LocationHierarchyNode type="warehouse" label={labels.warehouse} name={warehouse?.warehouse_name} code={warehouse?.warehouse_code} /><div className="relative"><LocationHierarchyNode type="zone" label={labels.zone} name={zone?.zone_name} code={zone?.zone_code} /></div><LocationHierarchyNode type={locationType} label={locationLabel} name={location.location_name} code={location.location_code}><LocationHierarchyBins bins={bins} locationId={location.location_id} label={labels.bins} availableLabel={labels.availableBins} movementBinLabel={labels.movementBin} openLocationLabel={labels.openLocation} actualBinId={actualBinId} /></LocationHierarchyNode></div></section>;
}

export type { LocationHierarchyContext, LocationHierarchyDirection, LocationHierarchyLabels } from './locationHierarchy.types';
