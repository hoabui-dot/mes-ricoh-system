import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Plus, Search, ShieldCheck, Mail, Phone, Calendar, Trash2, Edit, Check, X,
  ShieldAlert, Award, FileText, UserPlus, RefreshCw, Eye, BookOpen, Trash, CheckCircle2, MoreVertical, ChevronDown
} from 'lucide-react'
import { PageHeader, PermissionGuard, Spinner, EmptyState } from '@/components/common'
import { StatusBadge } from '@/components/industrial/StatusComponents'
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from '@/services/api-client'
import { PERMISSIONS } from '@/utils/permissions'
import type { WorkerDTO, DepartmentDTO, WorkshopDTO, TeamDTO, SkillDTO, CertificateDTO } from '@/types/domain'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'

export function WorkersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // State filters
  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [showArchived, setShowArchived] = React.useState(false)

  // Active Modals
  const [activeModal, setActiveModal] = React.useState<'create' | 'edit' | 'details' | 'skills' | 'certificates' | null>(null)
  const [selectedWorker, setSelectedWorker] = React.useState<WorkerDTO | null>(null)
  const [detailTab, setDetailTab] = React.useState<'demographics' | 'skills' | 'certificates'>('demographics')

  // Form states
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({})
  const [formData, setFormData] = React.useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    employee_code: '',
    employee_number: '',
    avatar: '',
    gender: 'other',
    birthday: '',
    address: '',
    employment_date: '',
    department_id: '',
    workshop_id: '',
    team_id: '',
    position: '',
    status: 'active',
    notes: '',
  })

  // Skills matrix editor states
  const [selectedSkillId, setSelectedSkillId] = React.useState('')
  const [skillLevel, setSkillLevel] = React.useState(1)

  // Certification editor states
  const [certForm, setCertForm] = React.useState({
    name: '',
    issuing_authority: '',
    certificate_number: '',
    issued_at: '',
    expires_at: '',
    document_url: '',
  })

  // Queries
  const { data: workersRes, isLoading: workersLoading } = useQuery({
    queryKey: ['workers'],
    queryFn: () => apiGet<WorkerDTO[]>('/workers?page_size=1000'),
  })

  const { data: deptsRes } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiGet<DepartmentDTO[]>('/departments'),
  })

  const { data: workshopsRes } = useQuery({
    queryKey: ['workshops'],
    queryFn: () => apiGet<WorkshopDTO[]>('/workshops'),
  })

  const { data: teamsRes } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiGet<TeamDTO[]>('/teams'),
  })

  const { data: skillsRes } = useQuery({
    queryKey: ['skills'],
    queryFn: () => apiGet<SkillDTO[]>('/skills'),
  })

  const { data: certsRes, refetch: refetchCerts } = useQuery({
    queryKey: ['certificates', selectedWorker?.id],
    queryFn: () => apiGet<CertificateDTO[]>(`/workers/${selectedWorker?.id}/certificates`),
    enabled: !!selectedWorker?.id && activeModal === 'certificates',
  })

  // Mutations
  const createWorkerMutation = useMutation({
    mutationFn: (data: typeof formData) => apiPost<WorkerDTO>('/workers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] })
      closeModal()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || 'Error creating worker'
      setFormErrors({ _global: msg })
    }
  })

  const updateWorkerMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: typeof formData }) => apiPut<WorkerDTO>(`/workers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] })
      closeModal()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || 'Error updating worker'
      setFormErrors({ _global: msg })
    }
  })

  const deleteWorkerMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/workers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] })
    }
  })

  const restoreWorkerMutation = useMutation({
    mutationFn: (id: string) => apiPatch(`/workers/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] })
    }
  })

  const updateSkillsMutation = useMutation({
    mutationFn: ({ id, skills }: { id: string, skills: { skill_id: string, proficiency_level: number }[] }) =>
      apiPut(`/workers/${id}/skills`, { skills }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] })
      // Update selected worker skills in local state
      refetchWorkersAndRefreshSelected()
    }
  })

  const addCertMutation = useMutation({
    mutationFn: ({ id, cert }: { id: string, cert: typeof certForm }) =>
      apiPost(`/workers/${id}/certificates`, cert),
    onSuccess: () => {
      refetchCerts()
      queryClient.invalidateQueries({ queryKey: ['workers'] })
      setCertForm({
        name: '',
        issuing_authority: '',
        certificate_number: '',
        issued_at: '',
        expires_at: '',
        document_url: '',
      })
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error?.message || 'Error adding certificate')
    }
  })

  const refetchWorkersAndRefreshSelected = async () => {
    const res = await queryClient.fetchQuery<any>({
      queryKey: ['workers'],
      queryFn: () => apiGet<WorkerDTO[]>('/workers?page_size=1000'),
    })
    const workersList = res?.data ?? []
    const updated = workersList.find((w: any) => w.id === selectedWorker?.id)
    if (updated) setSelectedWorker(updated)
  }

  // Filter dropdown data
  const departments = deptsRes?.data ?? []
  const workshops = workshopsRes?.data ?? []
  const teams = teamsRes?.data ?? []
  const skillsList = skillsRes?.data ?? []
  const certificates = certsRes?.data ?? []

  // Filtered dropdown lists in form (cascading dropdowns)
  const filteredWorkshopsForForm = workshops.filter(
    (w) => !formData.department_id || w.department_id === formData.department_id
  )
  const filteredTeamsForForm = teams.filter(
    (t) => !formData.workshop_id || t.workshop_id === formData.workshop_id
  )

  const workers = workersRes?.data ?? []

  const filteredWorkers = workers.filter((w) => {
    const nameMatch = w.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false
    const codeMatch = w.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) || false
    const numMatch = w.employee_number?.toLowerCase().includes(searchTerm.toLowerCase()) || false
    const phoneMatch = w.phone?.toLowerCase().includes(searchTerm.toLowerCase()) || false
    const emailMatch = w.email?.toLowerCase().includes(searchTerm.toLowerCase()) || false
    const matchesSearch = nameMatch || codeMatch || numMatch || phoneMatch || emailMatch

    const matchesStatus = statusFilter === 'all' || w.status === statusFilter

    // Filter soft-deleted workers:
    // If showArchived is true, we show ONLY resigned/retired/terminated workers
    // If showArchived is false, we show active/probation/suspended/inactive workers
    const isArchived = w.status === 'resigned' || w.status === 'retired' || w.status === 'terminated'
    const matchesArchive = showArchived ? isArchived : !isArchived

    return matchesSearch && matchesStatus && matchesArchive
  })

  const openCreateModal = () => {
    setFormErrors({})
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      employee_code: '',
      employee_number: '',
      avatar: '',
      gender: 'other',
      birthday: '',
      address: '',
      employment_date: new Date().toISOString().substring(0, 10),
      department_id: '',
      workshop_id: '',
      team_id: '',
      position: '',
      status: 'active',
      notes: '',
    })
    setActiveModal('create')
  }

  const openEditModal = (w: WorkerDTO) => {
    setFormErrors({})
    setSelectedWorker(w)
    setFormData({
      first_name: w.first_name,
      last_name: w.last_name,
      email: w.email,
      phone: w.phone,
      employee_code: w.employee_code,
      employee_number: w.employee_number,
      avatar: w.avatar || '',
      gender: w.gender || 'other',
      birthday: w.birthday ? new Date(w.birthday).toISOString().substring(0, 10) : '',
      address: w.address || '',
      employment_date: w.employment_date ? new Date(w.employment_date).toISOString().substring(0, 10) : '',
      department_id: w.department_id || '',
      workshop_id: w.workshop_id || '',
      team_id: w.team_id || '',
      position: w.position || '',
      status: w.status,
      notes: w.notes || '',
    })
    setActiveModal('edit')
  }

  const openDetailsModal = (w: WorkerDTO) => {
    setSelectedWorker(w)
    setDetailTab('demographics')
    setActiveModal('details')
  }

  const openSkillsModal = (w: WorkerDTO) => {
    setSelectedWorker(w)
    setSelectedSkillId('')
    setSkillLevel(1)
    setActiveModal('skills')
  }

  const openCertificatesModal = (w: WorkerDTO) => {
    setSelectedWorker(w)
    setActiveModal('certificates')
  }

  const closeModal = () => {
    setActiveModal(null)
    setSelectedWorker(null)
  }

  const handleSaveWorker = (e: React.FormEvent) => {
    e.preventDefault()
    setFormErrors({})

    // Validation
    const errors: Record<string, string> = {}
    if (!formData.first_name.trim()) errors.first_name = 'First name is required'
    if (!formData.last_name.trim()) errors.last_name = 'Last name is required'
    if (!formData.email.trim()) errors.email = 'Email is required'
    if (!formData.employee_code.trim()) errors.employee_code = 'Employee code is required'

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    // Format dates to ISO String matching backend datetime binding expectations
    const formattedData = {
      ...formData,
      birthday: formData.birthday ? `${formData.birthday}` : undefined,
      employment_date: formData.employment_date ? `${formData.employment_date}T09:00:00Z` : undefined
    }

    if (activeModal === 'create') {
      createWorkerMutation.mutate(formattedData as any)
    } else if (activeModal === 'edit' && selectedWorker) {
      updateWorkerMutation.mutate({ id: selectedWorker.id, data: formattedData as any })
    }
  }

  const handleDeleteWorker = (w: WorkerDTO) => {
    if (confirm(`Are you sure you want to terminate/deactivate ${w.full_name}? This performs a soft-delete.`)) {
      deleteWorkerMutation.mutate(w.id)
    }
  }

  const handleRestoreWorker = (w: WorkerDTO) => {
    if (confirm(`Restore employee profile for ${w.full_name}?`)) {
      restoreWorkerMutation.mutate(w.id)
    }
  }

  const handleAddSkill = () => {
    if (!selectedWorker || !selectedSkillId) return
    const existing = selectedWorker.skills || []
    if (existing.some((s: any) => s.skill_id === selectedSkillId)) {
      alert('Worker already has this skill!')
      return
    }

    const payload = [
      ...existing.map((s: any) => ({ skill_id: s.skill_id, proficiency_level: s.proficiency_level })),
      { skill_id: selectedSkillId, proficiency_level: skillLevel }
    ]
    updateSkillsMutation.mutate({ id: selectedWorker.id, skills: payload })
  }

  const handleRemoveSkill = (skillId: string) => {
    if (!selectedWorker) return
    const existing = selectedWorker.skills || []
    const payload = existing
      .filter((s: any) => s.skill_id !== skillId)
      .map((s: any) => ({ skill_id: s.skill_id, proficiency_level: s.proficiency_level }))

    updateSkillsMutation.mutate({ id: selectedWorker.id, skills: payload })
  }

  const handleAddCertificate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedWorker) return

    if (!certForm.name || !certForm.issuing_authority || !certForm.certificate_number || !certForm.issued_at || !certForm.expires_at) {
      alert('Please fill in all certificate details')
      return
    }

    // Format dates to ISO String
    const certPayload = {
      ...certForm,
      issued_at: `${certForm.issued_at}T00:00:00Z`,
      expires_at: `${certForm.expires_at}T00:00:00Z`
    }

    addCertMutation.mutate({ id: selectedWorker.id, cert: certPayload })
  }

  const getSkillLevelName = (lvl: number) => {
    switch (lvl) {
      case 1: return 'L1 - Beginner'
      case 2: return 'L2 - Intermediate'
      case 3: return 'L3 - Advanced'
      case 4: return 'L4 - Expert'
      default: return `L${lvl}`
    }
  }

  const getSkillLevelBadgeClass = (lvl: number) => {
    switch (lvl) {
      case 1: return 'badge badge-secondary'
      case 2: return 'badge badge-info'
      case 3: return 'badge badge-primary'
      case 4: return 'badge badge-success'
      default: return 'badge'
    }
  }

  return (
    <div className="fade-in">
      <PageHeader
        title={t('workers.title')}
        description={t('workers.subtitle')}
      >
        <PermissionGuard permission={PERMISSIONS.WORKER_CREATE}>
          <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
            <Plus size={14} />
            {t('workers.addWorker')}
          </button>
        </PermissionGuard>
      </PageHeader>

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            className="input"
            placeholder={t('workers.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: 36, width: '100%' }}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="btn btn-secondary btn-sm flex items-center gap-2" style={{ minWidth: 160, height: 38, justifyContent: 'space-between', padding: '0 12px', border: '1px solid var(--color-border-subtle)', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>
              <span className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-normal">{t('common.status')}:</span>
                <span className="font-semibold text-slate-700">
                  {statusFilter === 'all' ? t('common.all') :
                   statusFilter === 'active' ? t('common.active') :
                   statusFilter === 'probation' ? 'Probation' :
                   statusFilter === 'suspended' ? t('common.suspended') :
                   statusFilter === 'resigned' ? 'Resigned' :
                   statusFilter === 'retired' ? 'Retired' :
                   statusFilter === 'terminated' ? t('common.terminated') : statusFilter}
                </span>
              </span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 bg-white shadow-md border rounded-lg p-1">
            <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}>
              <DropdownMenuRadioItem value="all" className="text-xs hover:bg-slate-50 cursor-pointer">{t('common.all')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="active" className="text-xs hover:bg-slate-50 cursor-pointer">{t('common.active')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="probation" className="text-xs hover:bg-slate-50 cursor-pointer">Probation</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="suspended" className="text-xs hover:bg-slate-50 cursor-pointer">{t('common.suspended')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="resigned" className="text-xs hover:bg-slate-50 cursor-pointer">Resigned</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="retired" className="text-xs hover:bg-slate-50 cursor-pointer">Retired</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="terminated" className="text-xs hover:bg-slate-50 cursor-pointer">{t('common.terminated')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          className={`btn ${showArchived ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setShowArchived(!showArchived)}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ShieldAlert size={14} />
          {showArchived ? t('common.all') : t('workers.title')}
        </button>
      </div>

      {workersLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
          <Spinner size={36} />
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 20
        }}>
          {filteredWorkers.map((w) => {
            const dept = departments.find(d => d.id === w.department_id)
            const ws = workshops.find(wk => wk.id === w.workshop_id)
            const tm = teams.find(t => t.id === w.team_id)

            return (
              <div key={w.id} className="card hover-shadow" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, borderTop: w.status === 'resigned' || w.status === 'terminated' ? '4px solid var(--color-border-danger)' : '4px solid var(--color-brand-orange)', position: 'relative' }}>
                
                {/* Actions Dropdown */}
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="btn btn-secondary btn-xs" style={{ padding: 4, background: 'transparent', border: 'none', boxShadow: 'none' }}>
                        <MoreVertical size={16} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" style={{ width: 160 }}>
                      <DropdownMenuItem onClick={() => openDetailsModal(w)}>
                        <Eye size={14} className="mr-2" style={{ marginRight: 8 }} /> {t('common.details')}
                      </DropdownMenuItem>

                      <PermissionGuard permission={PERMISSIONS.WORKER_UPDATE}>
                        <DropdownMenuItem onClick={() => openSkillsModal(w)}>
                          <BookOpen size={14} className="mr-2" style={{ marginRight: 8 }} /> Skills
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openCertificatesModal(w)}>
                          <Award size={14} className="mr-2" style={{ marginRight: 8 }} /> Certs
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditModal(w)}>
                          <Edit size={14} className="mr-2" style={{ marginRight: 8 }} /> Edit profile
                        </DropdownMenuItem>
                      </PermissionGuard>

                      <PermissionGuard permission={w.status === 'resigned' || w.status === 'retired' || w.status === 'terminated' ? PERMISSIONS.WORKER_RESTORE : PERMISSIONS.WORKER_DELETE}>
                        <DropdownMenuSeparator />
                        {w.status === 'resigned' || w.status === 'retired' || w.status === 'terminated' ? (
                          <DropdownMenuItem onClick={() => handleRestoreWorker(w)} className="text-green-600 focus:text-green-600 focus:bg-green-50">
                            <RefreshCw size={14} className="mr-2" style={{ marginRight: 8 }} /> Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleDeleteWorker(w)} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                            <Trash2 size={14} className="mr-2" style={{ marginRight: 8 }} /> Deactivate
                          </DropdownMenuItem>
                        )}
                      </PermissionGuard>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {/* Header Info */}
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: w.avatar ? `url(${w.avatar}) center/cover` : 'linear-gradient(135deg, #F97316, #EA580C)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 700, color: 'white',
                    border: '2px solid var(--color-border-subtle)'
                  }}>
                    {!w.avatar && `${w.first_name?.[0]}${w.last_name?.[0]}`}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{w.full_name}</h4>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                      <span>Code: {w.employee_code}</span>
                      <span>•</span>
                      <span>No: {w.employee_number || '—'}</span>
                    </div>
                  </div>
                  <div>
                    <StatusBadge status={w.status} />
                  </div>
                </div>

                {/* Placement Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, borderTop: '1px solid var(--color-border-subtle)', paddingTop: 12, color: 'var(--color-text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{t('workers.position')}:</span>
                    <span style={{ fontWeight: 600 }}>{t('positions.' + w.position, w.position || 'Worker')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{t('workers.location')}:</span>
                    <span>
                      {dept?.name ? t('locations.' + dept.name, dept.name) : '—'} / {ws?.name ? t('locations.' + ws.name, ws.name) : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{t('workers.availability')}:</span>
                    <span className={`badge ${w.availability === 'available' ? 'badge-success' : 'badge-secondary'}`}>
                      {t('availabilityStatus.' + w.availability, w.availability)}
                    </span>
                  </div>
                </div>

                {/* Skills tags summary */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t('workers.skills')}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {w.skills && w.skills.length > 0 ? (
                      w.skills.slice(0, 3).map((s: any) => (
                        <span key={s.skill_id} className={getSkillLevelBadgeClass(s.proficiency_level)} style={{ fontSize: 10 }}>
                          {s.skill_code} ({s.proficiency_level})
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t('common.noData')}</span>
                    )}
                    {w.skills && w.skills.length > 3 && (
                      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', alignSelf: 'center' }}>+{w.skills.length - 3}</span>
                    )}
                  </div>
                </div>

              </div>
            )
          })}

          {filteredWorkers.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 48 }}>
              <EmptyState title="No workers found" description="Try refining your search terms or filters above." />
            </div>
          )}
        </div>
      )}

      {/* CREATE & EDIT WORKER MODAL */}
      <Dialog open={activeModal === 'create' || activeModal === 'edit'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeModal === 'create' ? 'Create Worker Profile' : `Edit Worker: ${selectedWorker?.full_name}`}</DialogTitle>
            <DialogDescription className="sr-only">Fill out the worker details</DialogDescription>
          </DialogHeader>

          {formErrors._global && (
            <div style={{ padding: '10px 14px', background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
              {formErrors._global}
            </div>
          )}

          <form onSubmit={handleSaveWorker} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Demographics row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>First Name *</label>
                <input
                  className="input"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
                {formErrors.first_name && <span style={{ color: '#EF4444', fontSize: 11 }}>{formErrors.first_name}</span>}
              </div>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Last Name *</label>
                <input
                  className="input"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
                {formErrors.last_name && <span style={{ color: '#EF4444', fontSize: 11 }}>{formErrors.last_name}</span>}
              </div>
            </div>

            {/* Codes row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Employee Code *</label>
                <input
                  className="input"
                  value={formData.employee_code}
                  disabled={activeModal === 'edit'}
                  onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                  placeholder="e.g. EMP045"
                />
                {formErrors.employee_code && <span style={{ color: '#EF4444', fontSize: 11 }}>{formErrors.employee_code}</span>}
              </div>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Employee Number</label>
                <input
                  className="input"
                  value={formData.employee_number}
                  onChange={(e) => setFormData({ ...formData, employee_number: e.target.value })}
                  placeholder="e.g. 20250045"
                />
              </div>
            </div>

            {/* Contact row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Email *</label>
                <input
                  className="input"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                {formErrors.email && <span style={{ color: '#EF4444', fontSize: 11 }}>{formErrors.email}</span>}
              </div>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Phone</label>
                <input
                  className="input"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>

            {/* Demographics details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Gender</label>
                <select
                  className="select"
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Birthday</label>
                <input
                  className="input"
                  type="date"
                  value={formData.birthday}
                  onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                />
              </div>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Position</label>
                <input
                  className="input"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  placeholder="e.g. Line Operator"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Address</label>
              <input
                className="input"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            {/* Org placement row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Department</label>
                <select
                  className="select"
                  value={formData.department_id}
                  onChange={(e) => setFormData({ ...formData, department_id: e.target.value, workshop_id: '', team_id: '' })}
                >
                  <option value="">— Select Department —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Workshop</label>
                <select
                  className="select"
                  value={formData.workshop_id}
                  onChange={(e) => setFormData({ ...formData, workshop_id: e.target.value, team_id: '' })}
                >
                  <option value="">— Select Workshop —</option>
                  {filteredWorkshopsForForm.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Team</label>
                <select
                  className="select"
                  value={formData.team_id}
                  onChange={(e) => setFormData({ ...formData, team_id: e.target.value })}
                >
                  <option value="">— Select Team —</option>
                  {filteredTeamsForForm.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Status and hire date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Employment Date</label>
                <input
                  className="input"
                  type="date"
                  value={formData.employment_date}
                  onChange={(e) => setFormData({ ...formData, employment_date: e.target.value })}
                />
              </div>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Status</label>
                <select
                  className="select"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="probation">Probation</option>
                  <option value="suspended">Suspended</option>
                  <option value="inactive">Inactive</option>
                  <option value="resigned">Resigned</option>
                  <option value="retired">Retired</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
            </div>

            {/* Avatar and Notes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Avatar Image URL</label>
                <input
                  className="input"
                  value={formData.avatar}
                  onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                  placeholder="https://url/avatar.jpg"
                />
              </div>
              <div>
                <label className="label" style={{ marginBottom: 6, display: 'block', fontSize: 12, fontWeight: 600 }}>Notes</label>
                <input
                  className="input"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notes on constraints, health checks..."
                />
              </div>
            </div>

            <DialogFooter>
              <button type="button" className="btn btn-secondary btn-sm" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={createWorkerMutation.isPending || updateWorkerMutation.isPending}>
                {createWorkerMutation.isPending || updateWorkerMutation.isPending ? 'Saving...' : 'Save Profile'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SKILLS MATRIX MODAL */}
      <Dialog open={activeModal === 'skills'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="sm:max-w-[550px] max-h-[80vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Skills Matrix: {selectedWorker?.full_name}</DialogTitle>
            <DialogDescription className="sr-only">Manage worker skills</DialogDescription>
          </DialogHeader>

          {/* Existing Skills List */}
          <div style={{ marginBottom: 24 }}>
            <h5 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 12 }}>Current Competencies</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedWorker?.skills && selectedWorker.skills.length > 0 ? (
                selectedWorker.skills.map((s: { skill_id: string; skill_name: string; skill_code: string; proficiency_level: number }) => (
                  <div key={s.skill_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-base)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border-subtle)' }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{s.skill_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 8 }}>{s.skill_code}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className={getSkillLevelBadgeClass(s.proficiency_level)}>{getSkillLevelName(s.proficiency_level)}</span>
                      <button className="btn btn-danger btn-xs" onClick={() => handleRemoveSkill(s.skill_id)} style={{ padding: 4 }}>
                        <Trash size={12} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: 12, textAlign: 'center', border: '1px dashed var(--color-border-subtle)', borderRadius: 8 }}>No skills assigned to worker yet</span>
              )}
            </div>
          </div>

          {/* Add Skill Form */}
          <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 18 }}>
            <h5 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 12 }}>Add New Skill</h5>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <select
                className="select"
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
                style={{ flex: 2, minWidth: 160 }}
              >
                <option value="">— Select Skill —</option>
                {skillsList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
              <select
                className="select"
                value={skillLevel}
                onChange={(e) => setSkillLevel(Number(e.target.value))}
                style={{ flex: 1, minWidth: 100 }}
              >
                <option value={1}>L1 - Beginner</option>
                <option value={2}>L2 - Intermediate</option>
                <option value={3}>L3 - Advanced</option>
                <option value={4}>L4 - Expert</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={handleAddSkill} disabled={!selectedSkillId}>
                <Plus size={14} />
                Add
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CERTIFICATIONS MODAL */}
      <Dialog open={activeModal === 'certificates'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Certifications: {selectedWorker?.full_name}</DialogTitle>
            <DialogDescription className="sr-only">Manage worker certifications</DialogDescription>
          </DialogHeader>

          {/* List Certificates */}
          <div style={{ marginBottom: 24 }}>
            <h5 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 12 }}>Certificates Log</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {certificates.map((c) => (
                <div key={c.id} style={{ padding: '12px 16px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                      {c.is_expired ? (
                        <span className="badge badge-danger" style={{ fontSize: 9 }}>EXPIRED</span>
                      ) : (
                        <span className="badge badge-success" style={{ fontSize: 9 }}>VALID</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      Authority: {c.issuing_authority} | No: {c.certificate_number}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      Expires: {new Date(c.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                  {c.document_url && (
                    <a href={c.document_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-xs">
                      <FileText size={12} />
                      Doc
                    </a>
                  )}
                </div>
              ))}
              {certificates.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: 14, textAlign: 'center', border: '1px dashed var(--color-border-subtle)', borderRadius: 8 }}>No certificates recorded</span>
              )}
            </div>
          </div>

          {/* Add Certificate Form */}
          <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 18 }}>
            <h5 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 12 }}>Log New Certificate</h5>
            <form onSubmit={handleAddCertificate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Cert Name</label>
                  <input
                    className="input input-sm"
                    value={certForm.name}
                    onChange={(e) => setCertForm({ ...certForm, name: e.target.value })}
                    placeholder="e.g. OSHA 30"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Issuing Authority</label>
                  <input
                    className="input input-sm"
                    value={certForm.issuing_authority}
                    onChange={(e) => setCertForm({ ...certForm, issuing_authority: e.target.value })}
                    placeholder="e.g. Dept of Labor"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Cert Code/No.</label>
                  <input
                    className="input input-sm"
                    value={certForm.certificate_number}
                    onChange={(e) => setCertForm({ ...certForm, certificate_number: e.target.value })}
                    placeholder="CERT-123"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Issued Date</label>
                  <input
                    className="input input-sm"
                    type="date"
                    value={certForm.issued_at}
                    onChange={(e) => setCertForm({ ...certForm, issued_at: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Expiry Date</label>
                  <input
                    className="input input-sm"
                    type="date"
                    value={certForm.expires_at}
                    onChange={(e) => setCertForm({ ...certForm, expires_at: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Document URL</label>
                <input
                  className="input input-sm"
                  value={certForm.document_url}
                  onChange={(e) => setCertForm({ ...certForm, document_url: e.target.value })}
                  placeholder="https://docs/cert.pdf"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm">Add Certificate</button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* DETAILS VIEW MODAL */}
      <Dialog open={activeModal === 'details'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto p-7">
          <DialogHeader className="sr-only">
            <DialogTitle>Worker Details: {selectedWorker?.full_name}</DialogTitle>
            <DialogDescription>View worker profile, skills, and certifications</DialogDescription>
          </DialogHeader>

          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 20 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: selectedWorker?.avatar ? `url(${selectedWorker.avatar}) center/cover` : 'linear-gradient(135deg, #F97316, #EA580C)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, color: 'white',
              border: '2px solid var(--color-border-subtle)'
            }}>
              {!selectedWorker?.avatar && `${selectedWorker?.first_name?.[0]}${selectedWorker?.last_name?.[0]}`}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{selectedWorker?.full_name}</h3>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                Code: {selectedWorker?.employee_code} | No: {selectedWorker?.employee_number || '—'}
              </div>
            </div>
          </div>

          {/* Details tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: 20 }}>
            <button
              className={`btn btn-xs`}
              style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: detailTab === 'demographics' ? '2px solid var(--color-brand-orange)' : 'none', fontWeight: detailTab === 'demographics' ? 600 : 400, borderRadius: 0, color: detailTab === 'demographics' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
              onClick={() => setDetailTab('demographics')}
            >
              Profile & Placement
            </button>
            <button
              className={`btn btn-xs`}
              style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: detailTab === 'skills' ? '2px solid var(--color-brand-orange)' : 'none', fontWeight: detailTab === 'skills' ? 600 : 400, borderRadius: 0, color: detailTab === 'skills' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
              onClick={() => setDetailTab('skills')}
            >
              Skills Profile ({selectedWorker?.skills?.length || 0})
            </button>
            <button
              className={`btn btn-xs`}
              style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: detailTab === 'certificates' ? '2px solid var(--color-brand-orange)' : 'none', fontWeight: detailTab === 'certificates' ? 600 : 400, borderRadius: 0, color: detailTab === 'certificates' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
              onClick={() => setDetailTab('certificates')}
            >
              Certifications
            </button>
          </div>

          {/* Tab contents */}
          {detailTab === 'demographics' && selectedWorker && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{t('workers.gender').toUpperCase()}</span>
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                    {selectedWorker.gender ? t('workers.' + selectedWorker.gender, selectedWorker.gender) : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{t('workers.birthday').toUpperCase()}</span>
                  <span style={{ fontWeight: 600 }}>{selectedWorker.birthday ? new Date(selectedWorker.birthday).toLocaleDateString() : '—'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{t('workers.phone').toUpperCase()}</span>
                  <span style={{ fontWeight: 600 }}>{selectedWorker.phone || '—'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{t('common.email').toUpperCase()}</span>
                  <span style={{ fontWeight: 600 }}>{selectedWorker.email || '—'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{t('workers.address').toUpperCase()}</span>
                  <span style={{ fontWeight: 600 }}>{selectedWorker.address || '—'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{t('workers.position').toUpperCase()}</span>
                  <span style={{ fontWeight: 600 }}>{t('positions.' + selectedWorker.position, selectedWorker.position || 'Worker')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{t('workers.employmentDate').toUpperCase()}</span>
                  <span style={{ fontWeight: 600 }}>{selectedWorker.employment_date ? new Date(selectedWorker.employment_date).toLocaleDateString() : '—'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{t('workers.notes').toUpperCase()}</span>
                  <span style={{ fontWeight: 600 }}>{selectedWorker.notes || '—'}</span>
                </div>
              </div>
            </div>
          )}

          {detailTab === 'skills' && selectedWorker && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedWorker.skills && selectedWorker.skills.length > 0 ? (
                selectedWorker.skills.map((s: any) => (
                  <div key={s.skill_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{s.skill_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 8 }}>{s.skill_code}</span>
                    </div>
                    <span className={getSkillLevelBadgeClass(s.proficiency_level)}>{getSkillLevelName(s.proficiency_level)}</span>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', padding: 20 }}>No skills assigned to worker profile</span>
              )}
            </div>
          )}

          {detailTab === 'certificates' && selectedWorker && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {certificates && certificates.length > 0 ? (
                // We'll load certs dynamically (they are also loaded on active certificates)
                certificates.map((c) => (
                  <div key={c.id} style={{ padding: '12px 14px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                        Authority: {c.issuing_authority} | No: {c.certificate_number}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {c.is_expired ? (
                        <span className="badge badge-danger">EXPIRED</span>
                      ) : (
                        <span className="badge badge-success">VALID</span>
                      )}
                      {c.document_url && (
                        <a href={c.document_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-xs">View</a>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', padding: 20 }}>No certificates recorded</span>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
