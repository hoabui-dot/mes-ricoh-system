import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, AlertCircle, XCircle, Ban, Calendar, Search, Filter, ShieldAlert } from 'lucide-react'
import { PageHeader, Spinner, EmptyState } from '@/components/common'
import { planningService } from '@/services/planning.service'
import type { WorkerAvailabilityDTO } from '@/types'

export function AvailabilityPage() {
  const { t } = useTranslation()
  const [date, setDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Fetch availability list
  const { data: availRes, isLoading } = useQuery({
    queryKey: ['workers-availability', date],
    queryFn: () => planningService.getWorkersAvailability(date),
  })

  const workers = availRes?.data ?? []

  // Filter list
  const filteredWorkers = workers.filter(w => {
    const fullName = `${w.first_name} ${w.last_name}`.toLowerCase()
    const matchesSearch = fullName.includes(search.toLowerCase()) || w.employee_code.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = !statusFilter || w.availability === statusFilter
    return matchesSearch && matchesFilter
  })

  // Helper icons and color badges for availability
  const getAvailabilityProps = (avail: WorkerAvailabilityDTO['availability']) => {
    switch (avail) {
      case 'available':
        return {
          label: t('planning_module.available'),
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          icon: <CheckCircle2 className="text-emerald-500 shrink-0" size={14} />,
        }
      case 'busy':
        return {
          label: t('planning_module.busy'),
          badgeClass: 'bg-amber-50 text-amber-700 border-amber-100',
          icon: <AlertCircle className="text-amber-500 shrink-0" size={14} />,
        }
      case 'leave':
        return {
          label: t('planning_module.leaveState'),
          badgeClass: 'bg-orange-50 text-orange-700 border-orange-100',
          icon: <XCircle className="text-orange-500 shrink-0" size={14} />,
        }
      case 'suspended':
        return {
          label: t('planning_module.suspended'),
          badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
          icon: <Ban className="text-slate-400 shrink-0" size={14} />,
        }
    }
  }

  return (
    <div className="fade-in space-y-6 max-w-7xl mx-auto p-4">
      <PageHeader
        title={t('planning_module.title')}
        description={t('planning_module.availabilityDesc', 'Verify operator daily status, active schedules, leave overlaps, and capacity hours.')}
      />

      {/* Filter panel */}
      <div className="card p-4 bg-white flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
            <Calendar size={14} className="text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-xs focus:outline-none bg-transparent"
            />
          </div>

          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white min-w-[240px]">
            <Search size={14} className="text-slate-400" />
            <input
              type="text"
              placeholder={t('planning_module.searchPlaceholder', 'Search by worker name or employee code...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs focus:outline-none bg-transparent w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 bg-white"
            >
              <option value="">{t('planning_module.availability')}</option>
              <option value="available">{t('planning_module.available')}</option>
              <option value="busy">{t('planning_module.busy')}</option>
              <option value="leave">{t('planning_module.leaveState')}</option>
              <option value="suspended">{t('planning_module.suspended')}</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          {t('planning_module.showing', 'Showing')} <span className="font-semibold text-slate-800">{filteredWorkers.length}</span> {t('planning_module.of', 'of')} {workers.length} {t('planning_module.operatorsUnit', 'operators')}
        </div>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64 bg-white rounded-lg card">
          <Spinner size={36} />
        </div>
      ) : (
        <div className="card bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-600">
                  <th className="px-6 py-4">{t('planning_module.employee')}</th>
                  <th className="px-6 py-4">{t('planning_module.code')}</th>
                  <th className="px-6 py-4">{t('planning_module.availState')}</th>
                  <th className="px-6 py-4">{t('planning_module.currentShiftDetail', 'Current Shift / Detail')}</th>
                  <th className="px-6 py-4">{t('planning_module.weeklyHours')}</th>
                  <th className="px-6 py-4">{t('planning_module.skills')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWorkers.map((w) => {
                  const props = getAvailabilityProps(w.availability)
                  const isHoursWarning = w.weekly_hours > 40

                  return (
                    <tr key={w.worker_id} className="hover:bg-slate-50/40 transition-colors">
                      {/* Name */}
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        {w.first_name} {w.last_name}
                      </td>

                      {/* Code */}
                      <td className="px-6 py-4 font-mono text-slate-400">
                        {w.employee_code}
                      </td>

                      {/* Availability status badge */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border ${props.badgeClass}`}>
                          {props.icon}
                          {props.label}
                        </span>
                      </td>

                      {/* Detail Column */}
                      <td className="px-6 py-4 text-slate-600">
                        {w.availability === 'busy' && w.today_shift && (
                          <span className="font-semibold text-amber-600">{t('planning_module.assigned', 'Assigned')}: {w.today_shift}</span>
                        )}
                        {w.availability === 'leave' && w.leave_reason && (
                          <span className="text-orange-600 italic">{t('planning_module.leaveState', 'On Leave')}: {w.leave_reason}</span>
                        )}
                        {w.availability === 'suspended' && (
                          <span className="text-slate-400">{t('planning_module.suspendedFromOps', 'Suspended from operations')}</span>
                        )}
                        {w.availability === 'available' && (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Weekly Hours (40hr warning!) */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-semibold ${isHoursWarning ? 'text-rose-600' : 'text-slate-800'}`}>
                            {w.weekly_hours} hrs
                          </span>
                          {isHoursWarning && (
                            <span title={t('planning_module.overtimeLimitWarning')}>
                              <ShieldAlert size={14} className="text-rose-500" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Skills Tags */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {w.skills && w.skills.map((skill, index) => (
                            <span 
                              key={index}
                              className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium"
                            >
                              {skill}
                            </span>
                          ))}
                          {(!w.skills || w.skills.length === 0) && (
                            <span className="text-slate-300">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filteredWorkers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12">
                      <EmptyState 
                        title={t('planning_module.noMatchesFound', 'No matches found')} 
                        description={t('planning_module.noMatchesFoundDesc', 'Adjust your filters or query a different date.')} 
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
