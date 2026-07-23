import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  ClipboardList,
  PlusCircle,
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
} from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';

export const Sidebar: React.FC = () => {
  const { t } = useI18n();
  const navSectionClass = "text-[11px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2 mt-4";
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-semibold transition ${
      isActive
        ? 'bg-action/15 text-amber-100 border border-action/45'
        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
    }`;

  return (
    <aside className="w-64 bg-slate-950 border-r border-border p-4 space-y-2 shrink-0 h-[calc(100vh-4rem)] overflow-y-auto">
      <div>
        <div className={navSectionClass}>{t('nav.operations')}</div>
        <div className="space-y-1">
          <NavLink to="/work-orders" className={linkClass} end>
            <ClipboardList className="w-4 h-4 text-amber-300" />
            <span>{t('nav.workOrders')}</span>
          </NavLink>
          <NavLink to="/work-orders/new" className={linkClass}>
            <PlusCircle className="w-4 h-4 text-orange-300" />
            <span>{t('nav.createWorkOrder')}</span>
          </NavLink>
        </div>
      </div>

      <div>
        <div className={navSectionClass}>{t('nav.masterDataTier1')}</div>
        <div className="space-y-1">
          <NavLink to="/master-data/items" className={linkClass}>
            <Package className="w-4 h-4 text-amber-300" />
            <span>{t('nav.items')}</span>
          </NavLink>
          <NavLink to="/master-data/mboms" className={linkClass}>
            <Layers className="w-4 h-4 text-sky-300" />
            <span>{t('nav.mbom')}</span>
          </NavLink>
          <NavLink to="/master-data/routings" className={linkClass}>
            <GitCommit className="w-4 h-4 text-amber-400" />
            <span>{t('nav.routing')}</span>
          </NavLink>
          <NavLink to="/master-data/production-versions" className={linkClass}>
            <Cpu className="w-4 h-4 text-orange-300" />
            <span>{t('nav.productionVersion')}</span>
          </NavLink>
        </div>
      </div>

      <div>
        <div className={navSectionClass}>{t('nav.labor')}</div>
        <div className="space-y-1">
          <NavLink to="/employees" className={linkClass}>
            <Users className="w-4 h-4 text-orange-300" />
            <span>{t('nav.employees')}</span>
          </NavLink>
          <NavLink to="/shifts" className={linkClass}>
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{t('nav.shifts')}</span>
          </NavLink>
          <NavLink to="/work-calendar" className={linkClass}>
            <CalendarDays className="w-4 h-4 text-sky-400" />
            <span>{t('nav.workCalendar')}</span>
          </NavLink>
        </div>
      </div>

      <div>
        <div className={navSectionClass}>{t('nav.masterDataTier2')}</div>
        <div className="space-y-1">
          <NavLink to="/master-data/work-centers" className={linkClass}>
            <Factory className="w-4 h-4 text-amber-300" />
            <span>{t('nav.workCenters')}</span>
          </NavLink>
          <NavLink to="/master-data/equipment" className={linkClass}>
            <Wrench className="w-4 h-4 text-slate-400" />
            <span>{t('nav.equipment')}</span>
          </NavLink>
          <NavLink to="/master-data/production-standards" className={linkClass}>
            <Gauge className="w-4 h-4 text-teal-400" />
            <span>{t('nav.productionStandards')}</span>
          </NavLink>
          <NavLink to="/master-data/reason-codes" className={linkClass}>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{t('nav.reasonCodes')}</span>
          </NavLink>
          <NavLink to="/master-data/skills" className={linkClass}>
            <Award className="w-4 h-4 text-amber-300" />
            <span>{t('nav.skills')}</span>
          </NavLink>
          <NavLink to="/console/mes/i18n-review" className={linkClass}>
            <Languages className="w-4 h-4 text-amber-300" />
            <span>{t('nav.i18nReview')}</span>
          </NavLink>
        </div>
      </div>
    </aside>
  );
};
