import { Flame } from 'lucide-react'

export function GlobalLoading() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground"
      style={{ background: 'radial-gradient(ellipse at 60% 20%, hsl(16 80% 12%) 0%, hsl(220 20% 6%) 70%)' }}
    >
      <div className="relative flex flex-col items-center gap-4">
        {/* Glowing Logo */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl shadow-xl bg-gradient-to-br from-brand-dark to-brand-light animate-pulse">
          <Flame className="h-8 w-8 text-white" />
        </div>
        
        {/* Spinner */}
        <div className="flex items-center gap-2 mt-4 text-brand-light font-semibold">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          <span className="text-sm">Đang tải hệ thống...</span>
        </div>
      </div>
    </div>
  )
}
