# MES Frontend — Manufacturing Execution System

A complete enterprise-grade frontend for the MES Platform, built with React 19, TypeScript, Vite, TailwindCSS, and a full suite of industrial-grade libraries.

## 🏭 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | TailwindCSS v4 (via @tailwindcss/vite) |
| UI Components | Radix UI primitives |
| Routing | TanStack Router |
| Server State | TanStack Query |
| Table | TanStack Table |
| Client State | Zustand |
| Forms | React Hook Form + Zod |
| API | Axios (typed SDK) |
| Charts | Recharts |
| Animations | Framer Motion |
| Icons | Lucide React |
| Date | date-fns |
| Testing | Vitest + React Testing Library |

## 🎨 Design System

Industrial-modern dark theme matching Siemens Opcenter / Rockwell FactoryTalk aesthetic.

**Brand Colors:**
- Primary: Orange `#F97316`
- Danger: Red `#EF4444`
- Background: Near-black `#0A0C0F`

**Typography:** Inter (UI) + JetBrains Mono (code/monospace)

## 📁 Folder Structure

```
src/
├── app/
│   ├── layouts/         # AuthLayout, DashboardLayout
│   └── pages/           # DashboardPage, NotFoundPage
├── modules/
│   ├── identity/        # Auth, Users, Roles, Permissions, Profile
│   ├── workforce/       # Workers, Departments, Teams, Skills
│   ├── planning/        # Shifts, Leave, Overtime
│   ├── production/      # Orders, Work Orders, Routings
│   ├── assignment/      # Proposals, History
│   ├── notifications/   # Notification center
│   └── audit/           # Audit log, Diff viewer
├── components/
│   ├── common/          # DataTable, PageHeader, StatusCard, etc.
│   └── industrial/      # StatusBadge, RealtimeDot, ConnectionBadge
├── hooks/               # useSSE, usePagination, etc.
├── services/            # API client + module services
├── stores/              # Zustand stores (auth, ui)
├── types/               # TypeScript types matching Go backend
├── utils/               # cn, date, permissions
├── providers/           # AppProvider (QueryClient + auth init)
└── routes/              # TanStack Router config
```

## 🚀 Development

```bash
# Install dependencies
npm install

# Start dev server (proxies /api to localhost:8080)
npm run dev

# Production build
npm run build

# Run tests
npm test
```

## 🔐 Authentication

- JWT login → tokens stored in `localStorage`
- Auto-refresh on 401 via Axios response interceptor
- Session expired event → global listener → logout
- Route guards via TanStack Router `beforeLoad`

## 📡 API Layer

All API calls go through the typed Axios client in `src/services/api-client.ts`:

- **Request interceptor:** injects `Authorization: Bearer {token}` + `X-Trace-ID` + `X-Correlation-ID` (matching Go backend middleware)
- **Response interceptor:** handles 401 with token refresh, propagates session-expired event
- All responses typed against `APIEnvelope<T>` matching Go `shared/response/response.go`

## 🔒 RBAC

Permission constants in `src/utils/permissions.ts` match Go backend Casbin policies exactly:
```
Worker.View, Worker.Create, Worker.Update, Worker.Delete
Planning.Publish, Assignment.Override, Dashboard.View, Audit.View
```

Use `<PermissionGuard permission={PERMISSIONS.WORKER_CREATE}>` to gate any UI element.

## 📊 Realtime (SSE)

Dashboard connects to `/api/v1/projection/stream` via `EventSource` with:
- Auto-reconnect on error
- Heartbeat handling
- Offline banner via `connected` state

## 🧪 Testing

```bash
npm run test          # Vitest unit tests
npm run test:coverage # Coverage report
```

## 🌍 i18n

English + Vietnamese planned. All user-facing strings use i18n keys.

## 📋 Implementation Phases

| Phase | Status |
|-------|--------|
| 1. Shell + Auth + RBAC + Navigation + Shared Components | ✅ Complete |
| 2. Identity Module | 🟡 In Progress |
| 3. Workforce Module | ⬜ Planned |
| 4. Planning Module | ⬜ Planned |
| 5. Production Module | ⬜ Planned |
| 6. Assignment Module | ⬜ Planned |
| 7. Dashboard + SSE | ⬜ Planned |
| 8. Notifications + Audit | ⬜ Planned |
