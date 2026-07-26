import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, BrainCircuit, Check, X, ShieldAlert } from 'lucide-react'
import { PageHeader, PermissionGuard, Spinner, EmptyState } from '@/components/common'
import { apiGet } from '@/services/api-client'
import { PERMISSIONS } from '@/utils/permissions'
import type { AssignmentDTO } from '@/types/domain'

export function AssignmentProposalsPage() {
  const { t } = useTranslation()
  const [selectedAssignmentId, setSelectedAssignmentId] = React.useState<string | null>(null)

  const { data: res, isLoading } = useQuery({
    queryKey: ['assignments-proposals'],
    queryFn: () => apiGet<AssignmentDTO[]>('/assignments'),
  })

  const proposals = (res?.data ?? []).filter((p) => p.status === 'proposed')
  const selectedProposal = proposals.find((p) => p.id === selectedAssignmentId) ?? proposals[0]

  React.useEffect(() => {
    if (selectedProposal && !selectedAssignmentId) {
      setSelectedAssignmentId(selectedProposal.id)
    }
  }, [selectedProposal, selectedAssignmentId])

  return (
    <div className="fade-in">
      <PageHeader
        title={t('assignment_proposals.title')}
        description={t('assignment_proposals.subtitle')}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, minHeight: '60vh' }}>
        {/* Left Side: Proposal cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <Spinner size={32} />
            </div>
          ) : (
            proposals.map((p) => (
              <div
                key={p.id}
                className="card"
                onClick={() => setSelectedAssignmentId(p.id)}
                style={{
                  padding: 16,
                  cursor: 'pointer',
                  border: selectedAssignmentId === p.id ? '1px solid var(--color-brand-orange)' : undefined,
                  background: selectedAssignmentId === p.id ? 'var(--color-bg-hover)' : undefined,
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{p.work_order_number}</span>
                  <span className="badge badge-info" style={{ fontSize: 10 }}>Score: {p.score.toFixed(0)}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{p.operation_name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Suggested: {p.worker_name}</div>
              </div>
            ))
          )}
          {!isLoading && proposals.length === 0 && (
            <EmptyState title="No active proposals" description="All assignments are finalized." />
          )}
        </div>

        {/* Right Side: Explain reasoning & Actions */}
        <div>
          {selectedProposal ? (
            <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-brand-orange)', marginBottom: 6 }}>
                  <BrainCircuit size={18} />
                  <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>AI Suitability Score Explanation</span>
                </div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{selectedProposal.worker_name}</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Assigned to operation: {selectedProposal.operation_name} ({selectedProposal.work_order_number})
                </p>
              </div>

              {/* Score Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span>Skill Match</span>
                    <span style={{ fontWeight: 600 }}>{selectedProposal.score_breakdown?.skill_match ?? 0}%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${selectedProposal.score_breakdown?.skill_match ?? 0}%`, background: '#10B981' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span>Availability</span>
                    <span style={{ fontWeight: 600 }}>{selectedProposal.score_breakdown?.availability ?? 0}%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${selectedProposal.score_breakdown?.availability ?? 0}%`, background: '#3B82F6' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span>Workload Compliance</span>
                    <span style={{ fontWeight: 600 }}>{selectedProposal.score_breakdown?.workload ?? 0}%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${selectedProposal.score_breakdown?.workload ?? 0}%`, background: '#F59E0B' }} />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--color-border-subtle)', paddingTop: 20 }}>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  <Check size={16} /> Approve Assignment
                </button>
                <button className="btn btn-ghost" style={{ border: '1px solid var(--color-border-default)', flex: 1, justifyContent: 'center' }}>
                  <X size={16} /> Reject / Re-run
                </button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
              <EmptyState title="No Proposal Selected" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
