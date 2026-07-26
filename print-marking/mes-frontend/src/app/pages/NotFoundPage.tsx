import { Link } from '@tanstack/react-router'
import { Home, AlertTriangle } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg-base)', padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{
          fontSize: 80, fontWeight: 900, lineHeight: 1,
          background: 'linear-gradient(135deg, #F97316, #EA580C)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          404
        </div>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 16 }}>
          Page not found
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8 }}>
          The page you are looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="btn btn-primary"
          style={{ marginTop: 24, display: 'inline-flex' }}
        >
          <Home size={14} />
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
