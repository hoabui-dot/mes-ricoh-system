import React from 'react'
import { createRouter, createRoute, createRootRoute, Outlet, redirect } from '@tanstack/react-router'
import { DashboardLayout } from '@/app/layouts/DashboardLayout'
import { tokenStorage } from '@/services/api-client'
import { useAuthStore } from '@/stores/auth.store'

// ─── Lazy page imports ────────────────────────────────────────────────────────
const LoginPage = React.lazy(() =>
  import('@/modules/identity/pages/LoginPage').then((m) => ({ default: m.LoginPage }))
)

// Dashboard
const DashboardPage = React.lazy(() =>
  import('@/app/pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
)

// Identity
const UsersPage = React.lazy(() =>
  import('@/modules/identity/pages/UsersPage').then((m) => ({ default: m.UsersPage }))
)
const RolesPage = React.lazy(() =>
  import('@/modules/identity/pages/RolesPage').then((m) => ({ default: m.RolesPage }))
)
const PermissionsPage = React.lazy(() =>
  import('@/modules/identity/pages/PermissionsPage').then((m) => ({ default: m.PermissionsPage }))
)

// Workforce
const WorkersPage = React.lazy(() =>
  import('@/modules/workforce/pages/WorkersPage').then((m) => ({ default: m.WorkersPage }))
)
const DepartmentsPage = React.lazy(() =>
  import('@/modules/workforce/pages/DepartmentsPage').then((m) => ({ default: m.DepartmentsPage }))
)
const TeamsPage = React.lazy(() =>
  import('@/modules/workforce/pages/TeamsPage').then((m) => ({ default: m.TeamsPage }))
)
const SkillsPage = React.lazy(() =>
  import('@/modules/workforce/pages/SkillsPage').then((m) => ({ default: m.SkillsPage }))
)

// Planning
const PlanningDashboardPage = React.lazy(() =>
  import('@/modules/planning/pages/PlanningDashboardPage').then((m) => ({ default: m.PlanningDashboardPage }))
)
const ShiftsPage = React.lazy(() =>
  import('@/modules/planning/pages/ShiftsPage').then((m) => ({ default: m.ShiftsPage }))
)
const MonthlyPlanningPage = React.lazy(() =>
  import('@/modules/planning/pages/MonthlyPlanningPage').then((m) => ({ default: m.MonthlyPlanningPage }))
)
const TeamAssignmentPage = React.lazy(() =>
  import('@/modules/planning/pages/TeamAssignmentPage').then((m) => ({ default: m.TeamAssignmentPage }))
)
const AvailabilityPage = React.lazy(() =>
  import('@/modules/planning/pages/AvailabilityPage').then((m) => ({ default: m.AvailabilityPage }))
)
const LeavePage = React.lazy(() =>
  import('@/modules/planning/pages/LeavePage').then((m) => ({ default: m.LeavePage }))
)
const OvertimePage = React.lazy(() =>
  import('@/modules/planning/pages/OvertimePage').then((m) => ({ default: m.OvertimePage }))
)

// Production
const ProductionOrdersPage = React.lazy(() =>
  import('@/modules/production/pages/ProductionOrdersPage').then((m) => ({ default: m.ProductionOrdersPage }))
)
const WorkOrdersPage = React.lazy(() =>
  import('@/modules/production/pages/WorkOrdersPage').then((m) => ({ default: m.WorkOrdersPage }))
)


// Assignment
const AssignmentProposalsPage = React.lazy(() =>
  import('@/modules/assignment/pages/AssignmentProposalsPage').then((m) => ({ default: m.AssignmentProposalsPage }))
)
const AssignmentHistoryPage = React.lazy(() =>
  import('@/modules/assignment/pages/AssignmentHistoryPage').then((m) => ({ default: m.AssignmentHistoryPage }))
)

// Notifications
const NotificationsPage = React.lazy(() =>
  import('@/modules/notifications/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
)

// Audit
const AuditPage = React.lazy(() =>
  import('@/modules/audit/pages/AuditPage').then((m) => ({ default: m.AuditPage }))
)

// Profile
const ProfilePage = React.lazy(() =>
  import('@/modules/identity/pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))
)

// New modules
const FactoryPage = React.lazy(() =>
  import('@/modules/factory/pages/FactoryPage').then((m) => ({ default: m.FactoryPage }))
)
const QualityPage = React.lazy(() =>
  import('@/modules/quality/pages/QualityPage').then((m) => ({ default: m.QualityPage }))
)
const WarehousePage = React.lazy(() =>
  import('@/modules/warehouse/pages/WarehousePage').then((m) => ({ default: m.WarehousePage }))
)
const AnalyticsPage = React.lazy(() =>
  import('@/modules/analytics/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
)

// 404 / 403
const NotFoundPage = React.lazy(() =>
  import('@/app/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage }))
)

// ─── Auth guard helper ────────────────────────────────────────────────────────
function requireAuth() {
  const token = tokenStorage.getAccessToken()
  if (!token) {
    throw redirect({ to: '/login' })
  }
}

// ─── Suspense wrapper ─────────────────────────────────────────────────────────
function PageSuspense({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
          <div style={{
            width: 28, height: 28,
            border: '2px solid rgba(249,115,22,0.2)',
            borderTopColor: '#F97316',
            borderRadius: '50%',
            animation: 'mes-spin 0.7s linear infinite',
          }} />
        </div>
      }
    >
      {children}
    </React.Suspense>
  )
}

// ─── Protected layout wrapper ─────────────────────────────────────────────────
function ProtectedLayout() {
  return (
    <DashboardLayout>
      <PageSuspense>
        <Outlet />
      </PageSuspense>
    </DashboardLayout>
  )
}

// ─── Root route ───────────────────────────────────────────────────────────────
const rootRoute = createRootRoute({
  component: Outlet,
})

// ─── Auth routes ──────────────────────────────────────────────────────────────
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => (
    <PageSuspense>
      <LoginPage />
    </PageSuspense>
  ),
  beforeLoad: () => {
    const token = tokenStorage.getAccessToken()
    if (token) throw redirect({ to: '/' })
  },
})

// ─── Protected routes ─────────────────────────────────────────────────────────
const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  component: ProtectedLayout,
  beforeLoad: requireAuth,
})

// Dashboard
const dashboardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/',
  component: () => <PageSuspense><DashboardPage /></PageSuspense>,
})

// Identity
const identityUsersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/identity/users',
  component: () => <PageSuspense><UsersPage /></PageSuspense>,
})

const identityRolesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/identity/roles',
  component: () => <PageSuspense><RolesPage /></PageSuspense>,
})

const identityPermissionsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/identity/permissions',
  component: () => <PageSuspense><PermissionsPage /></PageSuspense>,
})

// Workforce
const workforceWorkersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/workforce/workers',
  component: () => <PageSuspense><WorkersPage /></PageSuspense>,
})

const workforceDepartmentsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/workforce/departments',
  component: () => <PageSuspense><DepartmentsPage /></PageSuspense>,
})

const workforceTeamsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/workforce/teams',
  component: () => <PageSuspense><TeamsPage /></PageSuspense>,
})

const workforceSkillsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/workforce/skills',
  component: () => <PageSuspense><SkillsPage /></PageSuspense>,
})

// Planning
const planningDashboardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/planning/dashboard',
  component: () => <PageSuspense><PlanningDashboardPage /></PageSuspense>,
})

const planningShiftsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/planning/shifts',
  component: () => <PageSuspense><ShiftsPage /></PageSuspense>,
})

const planningCalendarRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/planning/calendar',
  component: () => <PageSuspense><MonthlyPlanningPage /></PageSuspense>,
})

const planningTeamsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/planning/teams',
  component: () => <PageSuspense><TeamAssignmentPage /></PageSuspense>,
})

const planningAvailabilityRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/planning/availability',
  component: () => <PageSuspense><AvailabilityPage /></PageSuspense>,
})

const planningLeaveRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/planning/leave',
  component: () => <PageSuspense><LeavePage /></PageSuspense>,
})

const planningOvertimeRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/planning/overtime',
  component: () => <PageSuspense><OvertimePage /></PageSuspense>,
})

// Production
const productionOrdersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/production/orders',
  component: () => <PageSuspense><ProductionOrdersPage /></PageSuspense>,
})

const workOrdersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/production/work-orders',
  component: () => <PageSuspense><WorkOrdersPage /></PageSuspense>,
})



// Assignment
const assignmentProposalsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/assignment/proposals',
  component: () => <PageSuspense><AssignmentProposalsPage /></PageSuspense>,
})

const assignmentHistoryRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/assignment/history',
  component: () => <PageSuspense><AssignmentHistoryPage /></PageSuspense>,
})

// Notifications
const notificationsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/notifications',
  component: () => <PageSuspense><NotificationsPage /></PageSuspense>,
})

// Audit
const auditRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/audit',
  component: () => <PageSuspense><AuditPage /></PageSuspense>,
})

// Profile
const profileRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/profile',
  component: () => <PageSuspense><ProfilePage /></PageSuspense>,
})

// New module routes
const factoryRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/factory',
  component: () => <PageSuspense><FactoryPage /></PageSuspense>,
})

const qualityRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/quality',
  component: () => <PageSuspense><QualityPage /></PageSuspense>,
})

const warehouseRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/warehouse',
  component: () => <PageSuspense><WarehousePage /></PageSuspense>,
})

const analyticsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/analytics',
  component: () => <PageSuspense><AnalyticsPage /></PageSuspense>,
})

// 404
const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '*',
  component: () => <PageSuspense><NotFoundPage /></PageSuspense>,
})

// ─── Router ────────────────────────────────────────────────────────────────────
export const router = createRouter({
  routeTree: rootRoute.addChildren([
    loginRoute,
    protectedRoute.addChildren([
      dashboardRoute,
      identityUsersRoute,
      identityRolesRoute,
      identityPermissionsRoute,
      workforceWorkersRoute,
      workforceDepartmentsRoute,
      workforceTeamsRoute,
      workforceSkillsRoute,
      planningDashboardRoute,
      planningShiftsRoute,
      planningCalendarRoute,
      planningTeamsRoute,
      planningAvailabilityRoute,
      planningLeaveRoute,
      planningOvertimeRoute,
      productionOrdersRoute,
      workOrdersRoute,
      assignmentProposalsRoute,
      assignmentHistoryRoute,
      notificationsRoute,
      auditRoute,
      profileRoute,
      factoryRoute,
      qualityRoute,
      warehouseRoute,
      analyticsRoute,
    ]),
    notFoundRoute,
  ]),
})

// Register router types
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
