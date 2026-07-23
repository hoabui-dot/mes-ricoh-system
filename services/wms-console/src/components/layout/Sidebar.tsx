import { BarChart3, Boxes, ClipboardList, Database, LayoutDashboard, Map, PackagePlus, Warehouse } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { cn } from '../../lib/utils';

const sections = [
  { title: 'nav.dashboard', items: [{ label: 'nav.dashboard', to: '/dashboard', icon: LayoutDashboard }, { label: 'nav.map', to: '/warehouse-map', icon: Map }] },
  {
    title: 'nav.masterData',
    items: [
      { label: 'nav.warehouses', to: '/master-data/warehouses', icon: Warehouse },
      { label: 'nav.zones', to: '/master-data/zones', icon: Boxes },
      { label: 'nav.locations', to: '/master-data/locations', icon: Database },
      { label: 'nav.bins', to: '/master-data/bins', icon: Boxes },
      { label: 'nav.itemUom', to: '/master-data/item-uom-mapping', icon: ClipboardList },
    ],
  },
  {
    title: 'nav.inventory',
    items: [
      { label: 'nav.balances', to: '/inventory/balances', icon: BarChart3 },
      { label: 'nav.movements', to: '/inventory/movements', icon: ClipboardList },
      { label: 'nav.discrepancies', to: '/inventory/discrepancies', icon: ClipboardList },
    ],
  },
  { title: 'nav.inbound', items: [{ label: 'nav.receipts', to: '/inbound/receipts', icon: PackagePlus }] },
  { title: 'nav.outbound', items: [{ label: 'nav.requests', to: '/outbound/requests', icon: ClipboardList }] },
];

export function Sidebar() {
  const { t } = useI18n();
  return (
    <aside className="flex w-72 shrink-0 flex-col bg-[var(--navy-800)] text-slate-100">
      <div className="border-b border-white/10 p-5">
        <div className="text-lg font-black">{t('app.name')}</div>
        <div className="mt-1 text-xs leading-5 text-slate-300">{t('app.subtitle')}</div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        {sections.map((section) => (
          <div key={section.title}>
            <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t(section.title)}</div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md border-l-4 px-3 py-2 text-sm font-semibold transition',
                        isActive ? 'border-action bg-white/12 text-white' : 'border-transparent text-slate-300 hover:bg-white/8 hover:text-white',
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {t(item.label)}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
