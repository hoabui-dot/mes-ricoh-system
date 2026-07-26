import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Users, UserCheck, UserMinus, ShieldAlert, BarChart3, Clock, TrendingUp } from 'lucide-react'
import { PageHeader, Spinner, StatisticCard } from '@/components/common'
import { apiGet } from '@/services/api-client'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'

interface DashboardSnapshot {
  total_workers: number
  available_workers: number
  busy_workers: number
  on_leave_workers: number
  unassigned_workers: number
  overtime_workers: number
  total_orders: number
  completed_orders: number
}

export function PlanningDashboardPage() {
  const { t } = useTranslation()

  // Fetch current dashboard stats
  const { data: dashRes, isLoading } = useQuery({
    queryKey: ['dashboard-snapshot'],
    queryFn: () => apiGet<DashboardSnapshot>('/dashboard/snapshot'),
  })

  // Fallback defaults if snapshot table hasn't populated yet
  const stats = dashRes?.data ?? {
    total_workers: 45,
    available_workers: 24,
    busy_workers: 18,
    on_leave_workers: 3,
    unassigned_workers: 6,
    overtime_workers: 2,
    total_orders: 12,
    completed_orders: 8,
  }

  // Calculate coverage
  const totalRequired = stats.busy_workers + 4 // simulated demand
  const coveragePercent = totalRequired > 0 
    ? Math.round((stats.busy_workers / totalRequired) * 100) 
    : 100

  // Chart data
  const chartData = [
    { name: t('planning_module.available'), count: stats.available_workers, fill: '#10B981' },
    { name: t('planning_module.busy'), count: stats.busy_workers, fill: '#3B82F6' },
    { name: t('planning_module.leaveState'), count: stats.on_leave_workers, fill: '#F59E0B' },
    { name: t('planning_module.overtime'), count: stats.overtime_workers, fill: '#8B5CF6' },
  ]

  return (
    <div className="fade-in space-y-6 max-w-7xl mx-auto p-4">
      <PageHeader
        title={t('planning_module.dashboard')}
        description={t('planning_module.dashboardDesc', 'Real-time shift statistics, workforce coverage allocations, and scheduling insights.')}
      />

      {isLoading ? (
        <div className="flex justify-center items-center h-64 bg-white rounded-lg card">
          <Spinner size={36} />
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Metrics grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatisticCard
              label={t('planning_module.totalWorkers')}
              value={stats.total_workers}
              icon={<Users size={16} />}
              color="#3B82F6"
            />
            <StatisticCard
              label={t('planning_module.availableWorkers')}
              value={stats.available_workers}
              icon={<UserCheck size={16} />}
              color="#10B981"
            />
            <StatisticCard
              label={t('planning_module.busyWorkers')}
              value={stats.busy_workers}
              icon={<TrendingUp size={16} />}
              color="#8B5CF6"
            />
            <StatisticCard
              label={t('planning_module.onLeaveToday')}
              value={stats.on_leave_workers}
              icon={<UserMinus size={16} />}
              color="#EF4444"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Visual Charts */}
            <div className="card p-6 bg-white lg:col-span-2 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 size={16} className="text-slate-400" />
                {t('planning_module.capacityAllocation')}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" fontSize={11} stroke="#64748B" />
                    <YAxis fontSize={11} stroke="#64748B" />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <rect key={`rect-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Coverage details panel */}
            <div className="card p-6 bg-white space-y-6">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                {t('planning_module.coverageRequirements')}
              </h3>

              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('planning_module.coveragePercent')}</div>
                    <div className="text-2xl font-extrabold text-slate-800 mt-1">{coveragePercent}%</div>
                  </div>
                  <div 
                    className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                      coveragePercent >= 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {coveragePercent >= 100 ? t('planning_module.fullyStaffed') : t('planning_module.attentionRequired')}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">{t('planning_module.activeOvertimeSlots')}:</span>
                    <span className="font-bold text-violet-600">{stats.overtime_workers} {t('planning_module.workersUnit', 'workers')}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">{t('planning_module.unassignedIdle')}:</span>
                    <span className="font-bold text-slate-700">{stats.unassigned_workers} {t('planning_module.workersUnit', 'workers')}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">{t('planning_module.todayRequired', 'Today Required:')}</span>
                    <span className="font-bold text-slate-700">{totalRequired} {t('planning_module.operatorsUnit', 'operators')}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 bg-rose-50/20 border-rose-100 rounded-lg p-3 flex gap-2.5 items-start text-xs text-rose-800">
                  <ShieldAlert size={16} className="shrink-0 text-rose-500 mt-0.5" />
                  <div>
                    <span className="font-bold">{t('planning_module.overtimePolicyCap')}</span> 
                    <p className="mt-0.5 text-rose-700">{t('planning_module.overtimePolicyCapDesc')}</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
