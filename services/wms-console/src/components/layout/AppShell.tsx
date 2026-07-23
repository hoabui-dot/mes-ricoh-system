import { Outlet, useLocation } from 'react-router-dom';
import { RouteErrorBoundary } from '../RouteErrorBoundary';
import { PageDetailButton } from '../shared/PageDetailButton';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const location = useLocation();
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(234,107,44,0.12),transparent_28%),linear-gradient(180deg,rgba(15,42,71,0.08),transparent_260px)] p-5">
          <div className="mb-3 flex justify-end">
            <PageDetailButton />
          </div>
          <RouteErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>
    </div>
  );
}
