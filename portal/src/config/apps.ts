// App definitions — which roles can access which cluster
export interface AppDefinition {
  id: string;
  name: string;
  acronym: string;
  description: string;
  url: string;
  color: string;       // CSS gradient-from color
  colorTo: string;     // CSS gradient-to color
  icon: string;        // emoji icon
  allowedRoles: string[];
  status: 'live' | 'coming-soon';
}

const getAppUrl = (envUrl: string | undefined, defaultPort: number): string => {
  if (envUrl && envUrl.trim() !== '') {
    return envUrl;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${defaultPort}`;
  }
  return `http://localhost:${defaultPort}`;
};

export const APPS: AppDefinition[] = [
  {
    id: 'mes',
    name: 'Manufacturing Execution System',
    acronym: 'MES',
    description: 'Quản lý thực thi sản xuất — Work Orders, QR Tracking, Kiosk hiện trường',
    url: getAppUrl(import.meta.env.VITE_MES_URL, 13052),
    color: '#6366f1',
    colorTo: '#8b5cf6',
    icon: '🏭',
    allowedRoles: ['EXECUTIVE', 'PLANT_MANAGER', 'OPERATOR', 'QC_TECHNICIAN'],
    status: 'live',
  },
  {
    id: 'wms',
    name: 'Warehouse Management System',
    acronym: 'WMS',
    description: 'Quản lý kho — Nhập / Xuất kho, Tồn kho theo Lot, Putaway',
    url: getAppUrl(import.meta.env.VITE_WMS_URL, 4001),
    color: '#0ea5e9',
    colorTo: '#06b6d4',
    icon: '📦',
    allowedRoles: ['EXECUTIVE', 'PLANT_MANAGER', 'WAREHOUSE_STAFF'],
    status: 'coming-soon',
  },
  {
    id: 'qms',
    name: 'Quality Management System',
    acronym: 'QMS',
    description: 'Quản lý chất lượng — Inspection Plans, NCR, CAPA, Traceability',
    url: getAppUrl(import.meta.env.VITE_QMS_URL, 4002),
    color: '#10b981',
    colorTo: '#059669',
    icon: '✅',
    allowedRoles: ['EXECUTIVE', 'PLANT_MANAGER', 'QC_TECHNICIAN'],
    status: 'coming-soon',
  },
];

// Role hierarchy for display
export const ROLE_DISPLAY: Record<string, string> = {
  EXECUTIVE: 'Giám đốc / Executive',
  PLANT_MANAGER: 'Quản lý Sản xuất',
  OPERATOR: 'Vận hành / Operator',
  QC_TECHNICIAN: 'Kỹ thuật viên QC',
  WAREHOUSE_STAFF: 'Nhân viên Kho',
};
