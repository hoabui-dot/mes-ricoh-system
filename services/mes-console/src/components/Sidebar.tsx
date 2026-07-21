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
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navSectionClass = "text-[11px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2 mt-4";
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
      isActive
        ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
    }`;

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 p-4 space-y-2 shrink-0 h-[calc(100vh-4rem)] overflow-y-auto">
      <div>
        <div className={navSectionClass}>Điều Hành & Lệnh Sản Xuất</div>
        <div className="space-y-1">
          <NavLink to="/work-orders" className={linkClass} end>
            <ClipboardList className="w-4 h-4 text-indigo-400" />
            <span>Danh Sách Lệnh (WO)</span>
          </NavLink>
          <NavLink to="/work-orders/new" className={linkClass}>
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            <span>Tạo Lệnh Sản Xuất</span>
          </NavLink>
        </div>
      </div>

      <div>
        <div className={navSectionClass}>Master Data — Tier 1 (Critical)</div>
        <div className="space-y-1">
          <NavLink to="/master-data/items" className={linkClass}>
            <Package className="w-4 h-4 text-indigo-400" />
            <span>Sản Phẩm & Revision</span>
          </NavLink>
          <NavLink to="/master-data/mboms" className={linkClass}>
            <Layers className="w-4 h-4 text-sky-400" />
            <span>Định Mức MBOM</span>
          </NavLink>
          <NavLink to="/master-data/routings" className={linkClass}>
            <GitCommit className="w-4 h-4 text-amber-400" />
            <span>Quy Trình Routing</span>
          </NavLink>
          <NavLink to="/master-data/production-versions" className={linkClass}>
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>Production Version</span>
          </NavLink>
        </div>
      </div>

      <div>
        <div className={navSectionClass}>Master Data — Tier 2 (Core Ops)</div>
        <div className="space-y-1">
          <NavLink to="/master-data/work-centers" className={linkClass}>
            <Factory className="w-4 h-4 text-purple-400" />
            <span>Trạm Sản Xuất (WorkCenter)</span>
          </NavLink>
          <NavLink to="/master-data/equipment" className={linkClass}>
            <Wrench className="w-4 h-4 text-slate-400" />
            <span>Thiết Bị (Equipment)</span>
          </NavLink>
          <NavLink to="/master-data/production-standards" className={linkClass}>
            <Gauge className="w-4 h-4 text-teal-400" />
            <span>Định Mức Năng Suất</span>
          </NavLink>
          <NavLink to="/master-data/reason-codes" className={linkClass}>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Mã Nguyên Nhân Phế</span>
          </NavLink>
          <NavLink to="/master-data/skills" className={linkClass}>
            <Award className="w-4 h-4 text-amber-300" />
            <span>Kỹ Năng Vận Hành</span>
          </NavLink>
        </div>
      </div>
    </aside>
  );
};
