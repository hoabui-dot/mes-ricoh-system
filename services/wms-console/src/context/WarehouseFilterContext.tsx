import React, { createContext, useContext, useMemo, useState } from 'react';

interface WarehouseFilterContextType {
  warehouseId: string;
  setWarehouseId: (warehouseId: string) => void;
}

const WarehouseFilterContext = createContext<WarehouseFilterContextType>({ warehouseId: '', setWarehouseId: () => {} });

export function WarehouseFilterProvider({ children }: { children: React.ReactNode }) {
  const [warehouseId, setWarehouseId] = useState(() => window.localStorage.getItem('wms.selectedWarehouseId') ?? '');
  const value = useMemo(
    () => ({
      warehouseId,
      setWarehouseId: (next: string) => {
        setWarehouseId(next);
        window.localStorage.setItem('wms.selectedWarehouseId', next);
      },
    }),
    [warehouseId],
  );
  return <WarehouseFilterContext.Provider value={value}>{children}</WarehouseFilterContext.Provider>;
}

export function useWarehouseFilter() {
  return useContext(WarehouseFilterContext);
}
