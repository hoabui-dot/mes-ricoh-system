import React from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Users,
  HardHat,
  CalendarDays,
  Factory,
  GitBranch,
  Bell,
  ClipboardList,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Search,
  Menu,
  Boxes,
  ShieldAlert,
  BarChart3,
  Globe,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useUIStore } from '@/stores/ui.store'
import { useAuthStore } from '@/stores/auth.store'
import { RealtimeDot } from '@/components/industrial/StatusComponents'
import { PERMISSIONS } from '@/utils/permissions'

// ─── Navigation Items ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    path: '/',
    permission: PERMISSIONS.DASHBOARD_VIEW,
  },
  {
    id: 'production',
    icon: Factory,
    path: '/production',
    permission: PERMISSIONS.PRODUCTION_VIEW,
    children: [
      { id: 'orders', path: '/production/orders' },
      { id: 'workOrders', path: '/production/work-orders' },
    ],
  },
  {
    id: 'planning',
    icon: CalendarDays,
    path: '/planning',
    permission: PERMISSIONS.SHIFT_VIEW,
    children: [
      { id: 'dashboard', path: '/planning/dashboard' },
      { id: 'calendar', path: '/planning/calendar' },
      { id: 'shifts', path: '/planning/shifts' },
      { id: 'teams', path: '/planning/teams' },
      { id: 'availability', path: '/planning/availability' },
      { id: 'leave', path: '/planning/leave' },
      { id: 'overtime', path: '/planning/overtime' },
    ],
  },
  {
    id: 'workforce',
    icon: HardHat,
    path: '/workforce',
    permission: PERMISSIONS.WORKER_VIEW,
    children: [
      { id: 'workers', path: '/workforce/workers' },
      { id: 'departments', path: '/workforce/departments' },
      { id: 'teams', path: '/workforce/teams' },
      { id: 'skills', path: '/workforce/skills' },
    ],
  },
  {
    id: 'assignment',
    icon: GitBranch,
    path: '/assignment',
    permission: PERMISSIONS.ASSIGNMENT_VIEW,
    children: [
      { id: 'proposals', path: '/assignment/proposals' },
      { id: 'history', path: '/assignment/history' },
    ],
  },
  {
    id: 'factory',
    icon: Factory,
    path: '/factory',
    permission: PERMISSIONS.WORKER_VIEW,
  },
  {
    id: 'quality',
    icon: ShieldAlert,
    path: '/quality',
    permission: PERMISSIONS.AUDIT_VIEW,
  },
  {
    id: 'warehouse',
    icon: Boxes,
    path: '/warehouse',
    permission: PERMISSIONS.PRODUCTION_VIEW,
  },
  {
    id: 'analytics',
    icon: BarChart3,
    path: '/analytics',
    permission: PERMISSIONS.DASHBOARD_VIEW,
  },
  {
    id: 'administration',
    icon: Settings,
    path: '/administration',
    permission: PERMISSIONS.USER_VIEW,
    children: [
      { id: 'users', path: '/identity/users' },
      { id: 'roles', path: '/identity/roles' },
      { id: 'permissions', path: '/identity/permissions' },
      { id: 'audit', path: '/audit' },
      { id: 'notifications', path: '/notifications' },
    ],
  },
] as const

// ─── Sidebar Component ────────────────────────────────────────────────────────
function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const { user } = useAuthStore()
  const location = useLocation()
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const { t } = useTranslation()

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <nav
      className={cn('sidebar', sidebarCollapsed && 'sidebar-collapsed')}
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        padding: sidebarCollapsed ? '0 16px' : '0 16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: 'linear-gradient(135deg, #F97316, #EA580C)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 0 12px rgba(249, 115, 22, 0.35)',
        }}>
          <Factory size={16} color="white" />
        </div>
        {!sidebarCollapsed && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.1 }}>MES Platform</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Manufacturing Execution</div>
          </div>
        )}
      </div>

      {/* Nav Items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)
          const hasChildren = 'children' in item && item.children
          const isExpanded = expanded === item.id

          return (
            <div key={item.id}>
              <div
                className={cn('sidebar-item', active && 'active')}
                onClick={() => {
                  if (hasChildren && !sidebarCollapsed) {
                    setExpanded(isExpanded ? null : item.id)
                  }
                }}
                title={sidebarCollapsed ? t(`nav.${item.id}`) : undefined}
                role="menuitem"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}
              >
                <Icon size={16} style={{ flexShrink: 0 }} />
                {!sidebarCollapsed && (
                  <>
                    <span style={{ flex: 1, fontSize: 13 }}>{t(`nav.${item.id}`)}</span>
                    {hasChildren && (
                      <ChevronRight
                        size={13}
                        style={{
                          color: 'var(--color-text-muted)',
                          transform: isExpanded ? 'rotate(90deg)' : undefined,
                          transition: 'transform 0.2s ease',
                        }}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Submenu */}
              {hasChildren && isExpanded && !sidebarCollapsed && (
                <div style={{ paddingLeft: 12, paddingRight: 8, paddingBottom: 4 }}>
                  {(item as unknown as { children: { id: string; path: string }[] }).children.map((child) => (
                    <Link
                      key={child.path}
                      to={child.path}
                      className={cn(
                        'sidebar-item',
                        location.pathname === child.path && 'active',
                      )}
                      style={{ marginLeft: 20, fontSize: 12 }}
                    >
                      <span
                        style={{
                          width: 4, height: 4, borderRadius: '50%',
                          background: location.pathname === child.path
                            ? 'var(--color-brand-orange)'
                            : 'var(--color-text-muted)',
                          flexShrink: 0,
                        }}
                      />
                      {t(`nav.${child.id}`)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* User + Collapse toggle */}
      <div style={{
        borderTop: '1px solid var(--color-border-subtle)',
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        {user && !sidebarCollapsed && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            borderRadius: 6,
            background: 'var(--color-bg-elevated)',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #F97316, #EA580C)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0,
            }}>
              {user.first_name?.[0]}{user.last_name?.[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.full_name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.roles?.[0]?.name ?? 'User'}
              </div>
            </div>
          </div>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? t('nav.expand') : t('nav.collapse')}
          style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 8 }}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>{t('nav.collapse')}</span></>}
        </button>
      </div>
    </nav>
  )
}

// ─── Header Component ─────────────────────────────────────────────────────────
function Header() {
  const { sidebarCollapsed, setCommandPaletteOpen } = useUIStore()
  const { user, logout } = useAuthStore()
  const { i18n, t } = useTranslation()

  const toggleLanguage = () => {
    const next = i18n.language.startsWith('vi') ? 'en' : 'vi'
    i18n.changeLanguage(next)
  }

  return (
    <header
      className="app-header"
      style={{ marginLeft: sidebarCollapsed ? 56 : 220, transition: 'margin-left 0.2s ease' }}
    >
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setCommandPaletteOpen(true)}
        aria-label="Open command palette"
        style={{ gap: 8, color: 'var(--color-text-muted)' }}
      >
        <Search size={14} />
        <span style={{ fontSize: 12 }}>{t('common.search')}</span>
        <kbd style={{
          fontSize: 10, padding: '1px 5px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid var(--color-border-default)',
          borderRadius: 4,
          color: 'var(--color-text-muted)',
        }}>⌘K</kbd>
      </button>

      <div style={{ flex: 1 }} />

      {/* Language Switcher */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={toggleLanguage}
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}
      >
        <Globe size={14} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          {i18n.language.startsWith('vi') ? 'VI' : 'EN'}
        </span>
      </button>

      {/* Realtime status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <RealtimeDot status="online" />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Live</span>
      </div>

      {/* Notifications */}
      <Link
        to="/notifications"
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 6,
          color: 'var(--color-text-secondary)',
          transition: 'all 0.15s ease',
        }}
        aria-label="Notifications"
      >
        <Bell size={16} />
      </Link>

      {/* Profile */}
      <Link
        to="/profile"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 10px',
          borderRadius: 6,
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-default)',
          color: 'var(--color-text-primary)',
          textDecoration: 'none',
          fontSize: 12,
          fontWeight: 500,
        }}
        aria-label="Profile"
      >
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'linear-gradient(135deg, #F97316, #EA580C)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700, color: 'white',
        }}>
          {user?.first_name?.[0]}{user?.last_name?.[0]}
        </div>
        {user?.first_name}
      </Link>

      {/* Logout */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={logout}
        aria-label="Logout"
        title="Logout"
      >
        <LogOut size={14} />
      </button>
    </header>
  )
}

// ─── Dashboard Layout ─────────────────────────────────────────────────────────
interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { sidebarCollapsed } = useUIStore()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-base)' }}>
      <Sidebar />
      <div
        className={cn('page-content', sidebarCollapsed && 'page-content-collapsed')}
      >
        <Header />
        <main className="page-main" role="main">
          {children}
        </main>
      </div>
    </div>
  )
}
