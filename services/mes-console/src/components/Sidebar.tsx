import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  ClipboardList,
  Package,
  Layers,
  GitCommit,
  Cpu,
  Factory,
  Wrench,
  Gauge,
  AlertTriangle,
  Award,
  Languages,
  Users,
  Clock,
  CalendarDays,
  Map,
  Monitor,
  Link2,
  Printer,
  Ruler,
  Tags,
} from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';

export const Sidebar: React.FC = () => {
  const { t } = useI18n();
  const navSectionClass = 'px-3 mb-2 mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground';
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-semibold transition ${
      isActive
        ? 'mes-nav-active border-action/45 bg-action/15 text-foreground shadow-sm'
        : 'border-transparent text-muted-foreground hover:bg-hover hover:text-foreground'
    }`;

  return (
    <aside className="h-full w-64 min-h-0 shrink-0 space-y-2 overflow-y-auto border-r border-border bg-surface-subtle p-4">
      <div>
        <div className={navSectionClass}>{t('nav.operations')}</div>
        <div className="space-y-1">
          <NavLink to="/work-orders" className={linkClass} end>
            <ClipboardList className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.workOrders')}</span>
          </NavLink>
        </div>
      </div>

      <div>
        <div className={navSectionClass}>{t('nav.masterDataTier1')}</div>
        <div className="space-y-1">
          <NavLink to="/master-data/items" className={linkClass}>
            <Package className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.items')}</span>
          </NavLink>
          <NavLink to="/master-data/uoms" className={linkClass}>
            <Ruler className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.uoms')}</span>
          </NavLink>
          <NavLink to="/master-data/material-groups" className={linkClass}>
            <Tags className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.materialGroups')}</span>
          </NavLink>
          <NavLink to="/master-data/mboms" className={linkClass}>
            <Layers className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.mbom')}</span>
          </NavLink>
          <NavLink to="/master-data/routings" className={linkClass}>
            <GitCommit className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.routing')}</span>
          </NavLink>
          <NavLink to="/master-data/production-versions" className={linkClass}>
            <Cpu className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.productionVersion')}</span>
          </NavLink>
          <NavLink to="/master-data/eboms" className={linkClass}>
            <GitCommit className="mes-nav-icon h-4 w-4 text-info" />
            <span>EBOM</span>
          </NavLink>
          <NavLink to="/master-data/operations" className={linkClass}>
            <Gauge className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('operationCatalog.title')}</span>
          </NavLink>
        </div>
      </div>

      <div>
        <div className={navSectionClass}>{t('nav.labor')}</div>
        <div className="space-y-1">
          <NavLink to="/employees" className={linkClass}>
            <Users className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.employees')}</span>
          </NavLink>
          <NavLink to="/shifts" className={linkClass}>
            <Clock className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.shifts')}</span>
          </NavLink>
          <NavLink to="/work-calendar" className={linkClass}>
            <CalendarDays className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.workCalendar')}</span>
          </NavLink>
        </div>
      </div>

      <div>
        <div className={navSectionClass}>{t('nav.masterDataTier2')}</div>
        <div className="space-y-1">
          <NavLink to="/master-data/factories" className={linkClass}>
            <Map className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('resourceFoundation.factories')}</span>
          </NavLink>
          <NavLink to="/master-data/shopfloors" className={linkClass}>
            <Map className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('resourceFoundation.shopfloors')}</span>
          </NavLink>
          <NavLink to="/master-data/production-lines" className={linkClass}>
            <Factory className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('resourceFoundation.productionLines')}</span>
          </NavLink>
          <NavLink to="/master-data/work-centers" className={linkClass}>
            <Factory className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.workCenters')}</span>
          </NavLink>
          <NavLink to="/master-data/workstations" className={linkClass}>
            <Monitor className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('resourceFoundation.workstations')}</span>
          </NavLink>
          <NavLink to="/master-data/print-stations" className={linkClass}>
            <Printer className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.printStations')}</span>
          </NavLink>
          <NavLink to="/master-data/machines" className={linkClass}>
            <Wrench className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('resourceFoundation.machines')}</span>
          </NavLink>
          <NavLink to="/master-data/resource-assignments" className={linkClass}>
            <Link2 className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('resourceFoundation.assignments')}</span>
          </NavLink>
          <NavLink to="/master-data/resource-capabilities" className={linkClass}>
            <Gauge className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('resourceFoundation.capabilities')}</span>
          </NavLink>
          <NavLink to="/master-data/resource-calendars" className={linkClass}>
            <CalendarDays className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('resourceFoundation.calendars')}</span>
          </NavLink>
          <NavLink to="/master-data/production-standards" className={linkClass}>
            <Gauge className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.productionStandards')}</span>
          </NavLink>
          <NavLink to="/master-data/operation-skill-requirements" className={linkClass}>
            <Award className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('resourceFoundation.operationSkillRequirements')}</span>
          </NavLink>
          <NavLink to="/master-data/reason-codes" className={linkClass}>
            <AlertTriangle className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.reasonCodes')}</span>
          </NavLink>
          <NavLink to="/master-data/skills" className={linkClass}>
            <Award className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.skills')}</span>
          </NavLink>
          <NavLink to="/console/mes/i18n-review" className={linkClass}>
            <Languages className="mes-nav-icon h-4 w-4 text-info" />
            <span>{t('nav.i18nReview')}</span>
          </NavLink>
        </div>
      </div>
    </aside>
  );
};
