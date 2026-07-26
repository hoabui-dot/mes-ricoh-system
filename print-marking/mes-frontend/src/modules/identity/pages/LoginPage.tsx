import React from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react'
import { AuthLayout } from '@/app/layouts/AuthLayout'
import { authService } from '@/services/identity.service'
import { tokenStorage } from '@/services/api-client'
import { useAuthStore } from '@/stores/auth.store'
import { getAPIErrorMessage } from '@/services/api-client'
import { Spinner } from '@/components/common'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const [showPassword, setShowPassword] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const loginMutation = useMutation({
    mutationFn: (data: LoginForm) => authService.login(data),
    onSuccess: (res) => {
      if (res.success && res.data) {
        tokenStorage.setAccessToken(res.data.access_token)
        tokenStorage.setRefreshToken(res.data.refresh_token)
        setUser(res.data.user)
        void navigate({ to: '/' })
      }
    },
    onError: (error) => {
      setServerError(getAPIErrorMessage(error))
    },
  })

  const onSubmit = (data: LoginForm) => {
    setServerError(null)
    loginMutation.mutate(data)
  }

  return (
    <AuthLayout
      title={t('login.title')}
      description={t('login.subtitle')}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Email */}
        <div>
          <label
            htmlFor="login-email"
            style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}
          >
            {t('login.email')}
          </label>
          <div style={{ position: 'relative' }}>
            <Mail
              size={14}
              style={{
                position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
              }}
            />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              className={`input ${errors.email ? 'input-error' : ''}`}
              style={{ paddingLeft: 34 }}
              placeholder="operator@mes-platform.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
          </div>
          {errors.email && (
            <p id="email-error" style={{ fontSize: 11, color: 'var(--color-text-danger)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertCircle size={11} /> {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="login-password"
            style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}
          >
            {t('login.password')}
          </label>
          <div style={{ position: 'relative' }}>
            <Lock
              size={14}
              style={{
                position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
              }}
            />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className={`input ${errors.password ? 'input-error' : ''}`}
              style={{ paddingLeft: 34, paddingRight: 40 }}
              placeholder="••••••••"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', display: 'flex', padding: 2,
              }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" style={{ fontSize: 11, color: 'var(--color-text-danger)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertCircle size={11} /> {errors.password.message}
            </p>
          )}
        </div>

        {/* Server error */}
        {serverError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 6, fontSize: 12, color: '#F87171',
          }} role="alert">
            <AlertCircle size={14} />
            {serverError}
          </div>
        )}

        {/* Submit */}
        <button
          id="login-submit"
          type="submit"
          className="btn btn-primary"
          disabled={loginMutation.isPending}
          style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontSize: 14 }}
        >
          {loginMutation.isPending ? (
            <>
              <Spinner size={16} color="white" />
              {t('common.loading')}
            </>
          ) : (
            t('login.button')
          )}
        </button>

        {/* Forgot password */}
        <div style={{ textAlign: 'center' }}>
          <a
            href="/forgot-password"
            style={{ fontSize: 12, color: 'var(--color-text-accent)', textDecoration: 'none' }}
          >
            Forgot your password?
          </a>
        </div>
      </form>
    </AuthLayout>
  )
}
