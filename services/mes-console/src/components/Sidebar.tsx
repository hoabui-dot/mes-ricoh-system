import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  Activity,
  Award,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock,
  Cpu,
  Factory,
  Gauge,
  GitCommit,
  Layers,
  Map,
  Monitor,
  Package,
  Printer,
  Ruler,
  Tags,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { cn } from '../lib/utils';

type SectionId = 'operations' | 'product' | 'labor' | 'resources';
type NavItem = { to: string; labelKey: string; icon: LucideIcon };

const sections: Array<{ id: SectionId; labelKey: string; icon: LucideIcon; items: NavItem[] }> = [
  { id: 'operations', labelKey: 'nav.productionOperations', icon: ClipboardList, items: [
    { to: '/analytics', labelKey: 'analytics.title', icon: Activity },
    { to: '/work-orders', labelKey: 'nav.workOrders', icon: ClipboardList },
  ] },
  { id: 'product', labelKey: 'nav.productDefinition', icon: Package, items: [
    { to: '/master-data/items', labelKey: 'nav.items', icon: Package },
    { to: '/master-data/uoms', labelKey: 'nav.uoms', icon: Ruler },
    { to: '/master-data/material-groups', labelKey: 'nav.materialGroups', icon: Tags },
    { to: '/master-data/mboms', labelKey: 'nav.mbom', icon: Layers },
    { to: '/master-data/routings', labelKey: 'nav.routing', icon: GitCommit },
    { to: '/master-data/production-versions', labelKey: 'nav.productionVersion', icon: Cpu },
    { to: '/master-data/operations', labelKey: 'operationCatalog.title', icon: Gauge },
  ] },
  { id: 'labor', labelKey: 'nav.workforceAndCalendar', icon: Users, items: [
    { to: '/employees', labelKey: 'nav.employees', icon: Users },
    { to: '/shifts', labelKey: 'nav.shifts', icon: Clock },
    { to: '/work-calendar', labelKey: 'nav.workCalendar', icon: CalendarDays },
  ] },
  { id: 'resources', labelKey: 'nav.plantStructureAndResources', icon: Factory, items: [
    { to: '/master-data/factories', labelKey: 'resourceFoundation.factories', icon: Map },
    { to: '/master-data/shopfloors', labelKey: 'resourceFoundation.shopfloors', icon: Map },
    { to: '/master-data/production-areas', labelKey: 'resourceFoundation.productionAreas', icon: Map },
    { to: '/master-data/production-lines', labelKey: 'resourceFoundation.productionLines', icon: Factory },
    { to: '/master-data/work-centers', labelKey: 'nav.workCenters', icon: Factory },
    { to: '/master-data/workstations', labelKey: 'resourceFoundation.workstations', icon: Monitor },
    { to: '/master-data/print-stations', labelKey: 'nav.printStations', icon: Printer },
    { to: '/master-data/machines', labelKey: 'resourceFoundation.machines', icon: Wrench },
    { to: '/master-data/resource-calendars', labelKey: 'resourceFoundation.calendars', icon: CalendarDays },
    { to: '/master-data/reason-codes', labelKey: 'nav.reasonCodes', icon: AlertTriangle },
    { to: '/master-data/skills', labelKey: 'nav.skills', icon: Award },
  ] },
];

function activeSection(pathname: string): SectionId {
  const match = sections.find((section) => section.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)));
  return match?.id || 'operations';
}

export const Sidebar: React.FC<{ className?: string; onNavigate?: () => void }> = ({ className, onNavigate }) => {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [openSection, setOpenSection] = useState<SectionId | null>(() => activeSection(pathname));

  useEffect(() => setOpenSection(activeSection(pathname)), [pathname]);

  const linkClass = ({ isActive }: { isActive: boolean }) => cn(
    'flex min-h-10 items-center gap-3 rounded-md border px-3 py-2 text-sm font-semibold transition',
    isActive
      ? 'mes-nav-active border-action/45 bg-action/15 text-foreground shadow-sm'
      : 'border-transparent text-muted-foreground hover:bg-hover hover:text-foreground',
  );

  return (
    <aside className={cn('h-full min-h-0 w-64 shrink-0 overflow-y-auto border-r border-border bg-surface-subtle p-3', className)}>
      <nav aria-label={t('nav.mainMenu')} className="space-y-2">
        {sections.map((section) => {
          const expanded = openSection === section.id;
          const SectionIcon = section.icon;
          return <section key={section.id} className="overflow-hidden rounded-md border border-border/70 bg-surface">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`mes-nav-${section.id}`}
              onClick={() => setOpenSection((current) => current === section.id ? null : section.id)}
              className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm font-bold text-foreground hover:bg-hover"
            >
              <SectionIcon className="h-4 w-4 shrink-0 text-info" />
              <span className="min-w-0 flex-1">{t(section.labelKey)}</span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
            </button>
            {expanded ? <div id={`mes-nav-${section.id}`} className="space-y-1 border-t border-border/70 p-2">
              {section.items.map((item) => {
                const ItemIcon = item.icon;
                return <NavLink key={item.to} to={item.to} className={linkClass} onClick={onNavigate}>
                  <ItemIcon className="mes-nav-icon h-4 w-4 shrink-0 text-info" />
                  <span className="min-w-0">{t(item.labelKey)}</span>
                </NavLink>;
              })}
            </div> : null}
          </section>;
        })}
      </nav>
    </aside>
  );
};
