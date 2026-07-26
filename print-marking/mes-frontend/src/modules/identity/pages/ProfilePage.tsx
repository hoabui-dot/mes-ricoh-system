import React from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { User, Lock, Mail, Save } from 'lucide-react'
import { PageHeader, Spinner } from '@/components/common'
import { StatusBadge } from '@/components/industrial/StatusComponents'
import { authService } from '@/services/identity.service'
import { useAuthStore } from '@/stores/auth.store'
import { getAPIErrorMessage } from '@/services/api-client'
import { formatDate } from '@/utils/date'

const profileSchema = z.object({
  first_name: z.string().min(1, 'First name required'),
  last_name: z.string().min(1, 'Last name required'),
})

const passwordSchema = z.object({
  current_password: z.string().min(6),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((d) => d.new_password === d.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
})

type ProfileForm = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>

export function ProfilePage() {
  const { user, setUser } = useAuthStore()
  const [profileSuccess, setProfileSuccess] = React.useState(false)
  const [passwordSuccess, setPasswordSuccess] = React.useState(false)
  const [profileError, setProfileError] = React.useState<string | null>(null)
  const [passwordError, setPasswordError] = React.useState<string | null>(null)

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
    },
  })

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileForm) => authService.updateProfile(data),
    onSuccess: (res) => {
      if (res.success && res.data) {
        setUser(res.data)
        setProfileSuccess(true)
        setTimeout(() => setProfileSuccess(false), 3000)
      }
    },
    onError: (e) => setProfileError(getAPIErrorMessage(e)),
  })

  const changePasswordMutation = useMutation({
    mutationFn: (data: PasswordForm) =>
      authService.changePassword({
        current_password: data.current_password,
        new_password: data.new_password,
      }),
    onSuccess: () => {
      setPasswordSuccess(true)
      passwordForm.reset()
      setTimeout(() => setPasswordSuccess(false), 3000)
    },
    onError: (e) => setPasswordError(getAPIErrorMessage(e)),
  })

  if (!user) return null

  return (
    <div className="fade-in" style={{ maxWidth: 640 }}>
      <PageHeader title="My Profile" description="Manage your account information" />

      {/* Profile info card */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #F97316, #EA580C)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700, color: 'white',
          }}>
            {user.first_name?.[0]}{user.last_name?.[0]}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>{user.full_name}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{user.email}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <StatusBadge status={user.status} />
              {(user.roles ?? []).map((r) => (
                <span key={r.id} className="badge badge-info" style={{ fontSize: 10 }}>{r.name}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Edit form */}
        <form
          onSubmit={profileForm.handleSubmit((d) => {
            setProfileError(null)
            updateProfileMutation.mutate(d)
          })}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>First Name</label>
              <input className="input" {...profileForm.register('first_name')} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Last Name</label>
              <input className="input" {...profileForm.register('last_name')} />
            </div>
          </div>
          {profileError && <p style={{ fontSize: 12, color: 'var(--color-text-danger)' }}>{profileError}</p>}
          {profileSuccess && <p style={{ fontSize: 12, color: '#22C55E' }}>Profile updated!</p>}
          <div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={updateProfileMutation.isPending} id="save-profile-btn">
              {updateProfileMutation.isPending ? <Spinner size={14} color="white" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </form>
      </div>

      {/* Change password card */}
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lock size={14} style={{ color: 'var(--color-brand-orange)' }} />
          Change Password
        </h2>
        <form
          onSubmit={passwordForm.handleSubmit((d) => {
            setPasswordError(null)
            changePasswordMutation.mutate(d)
          })}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {(['current_password', 'new_password', 'confirm_password'] as const).map((field) => (
            <div key={field}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                {field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </label>
              <input type="password" className="input" {...passwordForm.register(field)} />
              {passwordForm.formState.errors[field] && (
                <p style={{ fontSize: 11, color: 'var(--color-text-danger)', marginTop: 4 }}>
                  {passwordForm.formState.errors[field]?.message}
                </p>
              )}
            </div>
          ))}
          {passwordError && <p style={{ fontSize: 12, color: 'var(--color-text-danger)' }}>{passwordError}</p>}
          {passwordSuccess && <p style={{ fontSize: 12, color: '#22C55E' }}>Password changed successfully!</p>}
          <div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={changePasswordMutation.isPending} id="change-password-btn">
              {changePasswordMutation.isPending ? <Spinner size={14} color="white" /> : <Lock size={14} />}
              Change Password
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
