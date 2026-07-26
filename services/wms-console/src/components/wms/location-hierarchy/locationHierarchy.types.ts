import type { Bin, Location, Warehouse, Zone } from '../../../lib/api/types';

export type LocationNodeType = 'warehouse' | 'zone' | 'storage_location' | 'work_center_staging' | 'bin';

export type LocationHierarchyContext = {
  location?: Location;
  zone?: Zone;
  warehouse?: Warehouse;
  bins: Bin[];
};

export type LocationHierarchyDirection = 'source' | 'destination';

export type LocationHierarchyLabels = {
  warehouse: string;
  zone: string;
  storageLocation: string;
  workCenterStaging: string;
  bins: string;
  availableBins: string;
  movementBin: string;
  openLocation: string;
  unknownLocation: string;
};
