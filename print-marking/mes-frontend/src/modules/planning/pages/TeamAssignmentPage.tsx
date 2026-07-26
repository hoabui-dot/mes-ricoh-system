import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Users, Users2 } from 'lucide-react'
import { PageHeader, Spinner, EmptyState } from '@/components/common'
import { apiGet } from '@/services/api-client'
import type { TeamDTO, WorkerDTO } from '@/types'

interface TeamCoverageDTO {
  team_id: string
  team_name: string
  leader_name: string
  shift_name: string
  shift_time: string
  shift_color: string
  required_capacity: number
  assigned_capacity: number
  coverage_percentage: number
}

export function TeamAssignmentPage() {
  const { t } = useTranslation()
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  // Fetch teams list
  const { data: teamsRes, isLoading: isTeamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiGet<TeamDTO[]>('/teams'),
  })

  const teams = teamsRes?.data ?? []

  // Fetch workers to list team members
  const { data: workersRes } = useQuery({
    queryKey: ['workers'],
    queryFn: () => apiGet<WorkerDTO[]>('/workers?page_size=1000'),
  })

  const workers = workersRes?.data ?? []

  // Automatically select first team if none selected
  React.useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id)
    }
  }, [teams, selectedTeamId])

  const selectedTeam = teams.find(t => t.id === selectedTeamId)
  const teamMembers = workers.filter(w => w.team_id === selectedTeamId)

  // Simulate daily shift assignments mapping & coverage
  const coverageData: TeamCoverageDTO[] = teams.map((team, idx) => {
    const shifts = ['Morning Shift', 'Afternoon Shift', 'Night Shift']
    const shiftTimes = ['06:00 - 14:00', '14:00 - 22:00', '22:00 - 06:00']
    const colors = ['#3B82F6', '#F97316', '#8B5CF6']
    const memberCount = workers.filter(w => w.team_id === team.id).length

    const rot = idx % 3
    const req = Math.max(memberCount + 2, 8)
    const pct = req > 0 ? Math.round((memberCount / req) * 100) : 100

    return {
      team_id: team.id,
      team_name: team.name,
      leader_name: team.leader_id 
        ? (workers.find(w => w.id === team.leader_id)?.first_name || 'Team Leader')
        : 'Not Assigned',
      shift_name: shifts[rot],
      shift_time: shiftTimes[rot],
      shift_color: colors[rot],
      required_capacity: req,
      assigned_capacity: memberCount,
      coverage_percentage: pct,
    }
  })

  const selectedCoverage = coverageData.find(c => c.team_id === selectedTeamId)

  return (
    <div className="fade-in space-y-6 max-w-7xl mx-auto p-4">
      <PageHeader
        title={t('planning_module.rosterTeams')}
        description={t('planning_module.rosterTeamsDesc', 'Verify daily coverage requirements, track supervisory details, and monitor team roster distributions.')}
      />

      {isTeamsLoading ? (
        <div className="flex justify-center items-center h-64 bg-white rounded-lg card">
          <Spinner size={36} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left panel: Teams list */}
          <div className="space-y-4 lg:col-span-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('planning_module.rosterTeams')}</h2>
            <div className="space-y-3">
              {coverageData.map((cov) => (
                <div 
                  key={cov.team_id}
                  onClick={() => setSelectedTeamId(cov.team_id)}
                  className={`card cursor-pointer transition-all duration-200 border-l-4 p-4 hover:shadow-md ${
                    selectedTeamId === cov.team_id 
                      ? 'border-orange-500 shadow-sm bg-orange-50/10' 
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{cov.team_name}</h3>
                      <div className="text-xs text-slate-400 font-medium mt-1">{t('planning_module.leaderLabel', 'Leader')}: {cov.leader_name}</div>
                    </div>
                    <span 
                      className="px-2 py-0.5 text-[10px] font-bold text-white rounded"
                      style={{ backgroundColor: cov.shift_color }}
                    >
                      {cov.shift_name.split(' ')[0]}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>{t('planning_module.coveragePercent')}</span>
                      <span className="font-semibold">{cov.coverage_percentage}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          cov.coverage_percentage >= 100 ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(cov.coverage_percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {coverageData.length === 0 && (
                <EmptyState 
                  title={t('planning_module.noTeamsFound', 'No Teams Found')} 
                  description={t('planning_module.noTeamsFoundDesc', 'Teams must be configured in Workforce Module before scheduling shifts.')} 
                />
              )}
            </div>
          </div>

          {/* Right panel: Details & Members list */}
          <div className="lg:col-span-2 space-y-6">
            {selectedTeam && selectedCoverage ? (
              <div className="space-y-6">
                
                {/* Statistics panel */}
                <div className="card p-6 bg-white space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <div>
                      <h2 className="text-base font-bold text-slate-800">{selectedTeam.name}</h2>
                      <p className="text-xs text-slate-400 mt-1">{t('planning_module.status', 'Status')}: {t('planning_module.active', 'Active')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3.5 h-3.5 rounded-full" 
                        style={{ backgroundColor: selectedCoverage.shift_color }} 
                      />
                      <span className="text-sm font-semibold text-slate-700">{selectedCoverage.shift_name}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-50 rounded-xl p-4 space-y-1 text-center">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('planning_module.requiredStrength')}</div>
                      <div className="text-2xl font-extrabold text-slate-800">{selectedCoverage.required_capacity}</div>
                      <div className="text-[10px] text-slate-400">{t('planning_module.operatorsNeeded', 'operators needed')}</div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 space-y-1 text-center">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('planning_module.assignedStrength')}</div>
                      <div className="text-2xl font-extrabold text-slate-800">{selectedCoverage.assigned_capacity}</div>
                      <div className="text-[10px] text-slate-400">{t('planning_module.activeTeamMembers', 'active team members')}</div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 space-y-1 text-center">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('planning_module.coveragePercent')}</div>
                      <div 
                        className={`text-2xl font-extrabold ${
                          selectedCoverage.coverage_percentage >= 100 ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      >
                        {selectedCoverage.coverage_percentage}%
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {selectedCoverage.coverage_percentage >= 100 
                          ? t('planning_module.fullyStaffed', 'Fully Staffed') 
                          : t('planning_module.attentionRequired', 'Attention Req.')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Team members section */}
                <div className="card p-6 bg-white space-y-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Users size={16} className="text-slate-400" />
                    {t('planning_module.teamRoster')} ({teamMembers.length} {t('planning_module.workersUnit', 'workers')})
                  </h3>

                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500">
                          <th className="px-4 py-3">{t('planning_module.employee')}</th>
                          <th className="px-4 py-3">{t('planning_module.code')}</th>
                          <th className="px-4 py-3">{t('planning_module.position')}</th>
                          <th className="px-4 py-3">{t('planning_module.availState')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {teamMembers.map(m => (
                          <tr key={m.id} className="hover:bg-slate-50/40">
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              {m.first_name} {m.last_name}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-500">
                              {m.employee_code}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {m.position || 'Operator'}
                            </td>
                            <td className="px-4 py-3">
                              <span 
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  m.availability === 'available' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                    : m.availability === 'on_leave'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}
                              >
                                {m.availability === 'available'
                                  ? t('planning_module.available')
                                  : m.availability === 'on_leave'
                                  ? t('planning_module.leaveState')
                                  : m.availability}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {teamMembers.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-400">
                              {t('planning_module.noWorkersAssignedTeam', 'No workers currently assigned to this team.')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            ) : (
              <EmptyState 
                title={t('planning_module.noTeamSelected', 'No Team Selected')} 
                description={t('planning_module.noTeamSelectedDesc', 'Choose a team from the left sidebar to view coverage details.')} 
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
