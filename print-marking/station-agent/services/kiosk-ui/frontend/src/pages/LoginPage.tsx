import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AlertCircle, Flame, Lock, User } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(username, password)
      await login(res.data.token, res.data.userId, res.data.username)
      navigate('/')
    } catch {
      setError('Tên đăng nhập hoặc mật khẩu không chính xác')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-background relative overflow-hidden">

      {/* Subtle background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Top-right accent */}
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, hsl(var(--brand)) 0%, transparent 70%)' }}
        />
        {/* Bottom-left accent */}
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, hsl(var(--info)) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative w-full max-w-md">

        {/* Station label above card */}
        <div className="text-center mb-8">
          <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-muted-fg">
            ND Station Kiosk System
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-2xl border border-border bg-card text-foreground overflow-hidden [box-shadow:var(--shadow-lg,0_20px_60px_rgba(0,0,0,0.12))]">

          {/* Orange accent stripe at top */}
          <div className="h-1 w-full bg-gradient-to-r from-brand-dark via-brand to-brand-light" />

          <div className="p-8">

            {/* Logo + title */}
            <div className="text-center mb-8">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-white [box-shadow:0_8px_24px_hsl(var(--brand)/0.35)]">
                <Flame className="h-8 w-8" />
              </div>
              <h1 className="text-[28px] font-bold text-foreground leading-tight">Kiosk Trạm ND</h1>
              <p className="text-[13px] text-muted-fg mt-2">
                Hệ thống quản lý in &amp; khắc laser — Vui lòng đăng nhập
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Username */}
              <div className="space-y-2">
                <label htmlFor="username" className="block text-[14px] font-semibold text-foreground">
                  Tên đăng nhập
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-fg pointer-events-none" />
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Nhập tên đăng nhập"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label htmlFor="password" className="block text-[14px] font-semibold text-foreground">
                  Mật khẩu
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-fg pointer-events-none" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-error/25 bg-error/8 px-4 py-3 text-[14px] font-semibold text-error">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 text-[16px] font-semibold mt-2 gap-2 shadow-sm"
              >
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Đang đăng nhập…
                  </>
                ) : 'Đăng nhập'}
              </Button>
            </form>
          </div>

          {/* Footer strip */}
          <div className="px-8 py-4 border-t border-border bg-surface-2 text-center">
            <p className="text-[12px] text-muted-fg">
              Chỉ dành cho nhân viên được uỷ quyền · Liên hệ quản trị viên nếu cần hỗ trợ
            </p>
          </div>
        </div>

        {/* Version footnote */}
        <p className="text-center text-[12px] text-muted-fg mt-6 opacity-60">
          ND Station Kiosk © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
