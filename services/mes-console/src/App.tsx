import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { I18nProvider } from '@mom-platform/i18n-ui-shared';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { PageDetailButton } from './components/PageDetailButton';
import { RouteHeader } from './components/RouteHeader';
import { Toaster } from 'sonner';
import { mesConsoleI18n } from './i18n';

import { ItemsScreen } from './routes/master-data/ItemsScreen';
import { UomManagementScreen } from './routes/master-data/UomManagementScreen';
import { MaterialGroupManagementScreen } from './routes/master-data/MaterialGroupManagementScreen';
import { MbomScreen } from './routes/master-data/MbomScreen';
import { MbomCreateScreen } from './routes/master-data/MbomCreateScreen';
import { RoutingScreen } from './routes/master-data/RoutingScreen';
import { RoutingCreateScreen } from './routes/master-data/RoutingCreateScreen';
import { RoutingOperationsScreen } from './routes/master-data/RoutingOperationsScreen';
import { ProductionVersionScreen } from './routes/master-data/ProductionVersionScreen';
import { ProductionVersionCrudScreen } from './routes/master-data/ProductionVersionCrudScreen';
import { Tier2AdminScreen } from './routes/master-data/Tier2AdminScreen';
import { WorkCentersScreen } from './routes/master-data/WorkCentersScreen';
import { I18nReviewScreen } from './routes/master-data/I18nReviewScreen';
import { EmployeesScreen } from './routes/master-data/EmployeesScreen';
import { ShiftsScreen } from './routes/master-data/ShiftsScreen';
import { WorkCalendarScreen } from './routes/master-data/WorkCalendarScreen';
import { ResourceFoundationScreen } from './routes/master-data/ResourceFoundationScreen';
import { SkillManagementScreen } from './routes/master-data/SkillManagementScreen';
import { PlanningConstraintsScreen } from './routes/master-data/PlanningConstraintsScreen';
import { OperationCatalogScreen } from './routes/master-data/OperationCatalogScreen';
import { PrintStationsScreen } from './routes/master-data/PrintStationsScreen';
import { NotFoundScreen } from './routes/NotFoundScreen';
import { AnalyticsOverviewScreen } from './routes/analytics/AnalyticsOverviewScreen';
import { AnalyticsDeepDiveScreen } from './routes/analytics/AnalyticsDeepDiveScreen';

import { WOListScreen } from './routes/work-orders/WOListScreen';
import { WOCreateScreen } from './routes/work-orders/WOCreateScreen';
import { WODetailScreen } from './routes/work-orders/WODetailScreen';
import { AlertTriangle } from 'lucide-react';

function LegacyRedirect({ from, to }: { from: string; to: string }) {
  const location = useLocation();
  const suffix = location.pathname.startsWith(from) ? location.pathname.slice(from.length) : '';
  return <Navigate to={`${to}${suffix}${location.search}${location.hash}`} replace />;
}

const AppRoutes: React.FC = () => {
  const location = useLocation();

  return (
    <RouteErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<Navigate to="/work-orders" replace />} />
        <Route path="/analytics" element={<AnalyticsOverviewScreen />} />
        <Route path="/analytics/production" element={<AnalyticsDeepDiveScreen />} />
        <Route path="/analytics/lines-resources" element={<AnalyticsDeepDiveScreen />} />
        <Route path="/analytics/execution-quality" element={<AnalyticsDeepDiveScreen />} />
        <Route path="/analytics/materials-traceability" element={<AnalyticsDeepDiveScreen />} />
        <Route path="/analytics/print-system" element={<AnalyticsDeepDiveScreen />} />
        <Route path="/analytics/:tab" element={<AnalyticsDeepDiveScreen />} />

        {/* Area B: Work Order Planning */}
        <Route path="/work-orders" element={<WOListScreen />} />
        <Route path="/work-orders/new" element={<WOCreateScreen />} />
        <Route path="/work-orders/:id" element={<WODetailScreen />} />
        <Route path="/console/mes/work-orders/*" element={<LegacyRedirect from="/console/mes/work-orders" to="/work-orders" />} />

        {/* Area A: Tier 1 Master Data Admin */}
        <Route path="/master-data/items" element={<ItemsScreen />} />
        <Route path="/master-data/uoms" element={<UomManagementScreen />} />
        <Route path="/master-data/material-groups" element={<MaterialGroupManagementScreen />} />
        <Route path="/master-data/mboms" element={<MbomScreen />} />
        <Route path="/master-data/mboms/new" element={<MbomCreateScreen />} />
        <Route path="/master-data/mboms/:id" element={<MbomScreen />} />
        <Route path="/master-data/routings" element={<RoutingScreen />} />
        <Route path="/master-data/routings/new" element={<RoutingCreateScreen />} />
        <Route path="/master-data/routings/:id/edit" element={<RoutingCreateScreen />} />
        <Route path="/master-data/routings/:id/operations" element={<RoutingOperationsScreen />} />
        <Route path="/master-data/production-versions" element={<ProductionVersionScreen />} />
        <Route path="/master-data/production-versions/new" element={<ProductionVersionCrudScreen />} />
        <Route path="/master-data/production-versions/:id/edit" element={<ProductionVersionCrudScreen />} />
        <Route path="/master-data/operations" element={<OperationCatalogScreen />} />
        <Route path="/master-data/operations/new" element={<OperationCatalogScreen />} />
        <Route path="/master-data/operations/:id" element={<OperationCatalogScreen />} />
        <Route path="/master-data/operations/:id/edit" element={<OperationCatalogScreen />} />
        <Route path="/master-data/production-areas" element={<ResourceFoundationScreen entity="production-areas" />} />
        <Route path="/master-data/production-areas/new" element={<ResourceFoundationScreen entity="production-areas" />} />
        <Route path="/master-data/production-areas/:id" element={<ResourceFoundationScreen entity="production-areas" />} />
        <Route path="/master-data/production-areas/:id/edit" element={<ResourceFoundationScreen entity="production-areas" />} />
        <Route path="/master-data/production-lines" element={<ResourceFoundationScreen entity="production-lines" />} />
        <Route path="/master-data/production-lines/new" element={<ResourceFoundationScreen entity="production-lines" />} />
        <Route path="/master-data/production-lines/:id" element={<ResourceFoundationScreen entity="production-lines" />} />
        <Route path="/master-data/production-lines/:id/edit" element={<ResourceFoundationScreen entity="production-lines" />} />
        <Route path="/master-data/factories" element={<ResourceFoundationScreen entity="factories" />} />
        <Route path="/master-data/factories/new" element={<ResourceFoundationScreen entity="factories" />} />
        <Route path="/master-data/factories/:id" element={<ResourceFoundationScreen entity="factories" />} />
        <Route path="/master-data/factories/:id/edit" element={<ResourceFoundationScreen entity="factories" />} />
        <Route path="/master-data/shopfloors" element={<ResourceFoundationScreen entity="shopfloors" />} />
        <Route path="/master-data/shopfloors/new" element={<ResourceFoundationScreen entity="shopfloors" />} />
        <Route path="/master-data/shopfloors/:id" element={<ResourceFoundationScreen entity="shopfloors" />} />
        <Route path="/master-data/shopfloors/:id/edit" element={<ResourceFoundationScreen entity="shopfloors" />} />
        <Route path="/master-data/product-recipes/*" element={<LegacyRedirect from="/master-data/product-recipes" to="/master-data/production-versions" />} />
        <Route path="/console/mes/items/*" element={<LegacyRedirect from="/console/mes/items" to="/master-data/items" />} />
        <Route path="/console/mes/routings/*" element={<LegacyRedirect from="/console/mes/routings" to="/master-data/routings" />} />
        <Route path="/console/mes/production-versions/*" element={<LegacyRedirect from="/console/mes/production-versions" to="/master-data/production-versions" />} />
        <Route path="/employees" element={<EmployeesScreen />} />
        <Route path="/shifts" element={<ShiftsScreen />} />
        <Route path="/work-calendar" element={<WorkCalendarScreen />} />
        <Route path="/console/mes/employees/*" element={<LegacyRedirect from="/console/mes/employees" to="/employees" />} />
        <Route path="/console/mes/shifts/*" element={<LegacyRedirect from="/console/mes/shifts" to="/shifts" />} />
        <Route path="/console/mes/work-calendar/*" element={<LegacyRedirect from="/console/mes/work-calendar" to="/work-calendar" />} />
        <Route path="/console/mes/mboms/*" element={<LegacyRedirect from="/console/mes/mboms" to="/master-data/mboms" />} />

        {/* Area A: Tier 2 Master Data Admin */}
        <Route path="/master-data/work-centers" element={<WorkCentersScreen />} />
        <Route path="/master-data/work-centers/new" element={<ResourceFoundationScreen entity="work-centers" />} />
        <Route path="/master-data/work-centers/:id" element={<ResourceFoundationScreen entity="work-centers" />} />
        <Route path="/master-data/work-centers/:id/edit" element={<ResourceFoundationScreen entity="work-centers" />} />
        <Route path="/master-data/workstations" element={<ResourceFoundationScreen entity="workstations" />} />
        <Route path="/master-data/workstations/new" element={<ResourceFoundationScreen entity="workstations" />} />
        <Route path="/master-data/workstations/:id" element={<ResourceFoundationScreen entity="workstations" />} />
        <Route path="/master-data/workstations/:id/edit" element={<ResourceFoundationScreen entity="workstations" />} />
        <Route path="/master-data/print-stations" element={<PrintStationsScreen />} />
        <Route path="/master-data/resource-assignments/*" element={<LegacyRedirect from="/master-data/resource-assignments" to="/master-data/workstations" />} />
        <Route path="/master-data/resource-capabilities/*" element={<LegacyRedirect from="/master-data/resource-capabilities" to="/master-data/routings" />} />
        <Route path="/master-data/resource-calendars" element={<PlanningConstraintsScreen entity="resource-calendars" />} />
        <Route path="/master-data/resource-calendars/new" element={<PlanningConstraintsScreen entity="resource-calendars" />} />
        <Route path="/master-data/resource-calendars/:id" element={<PlanningConstraintsScreen entity="resource-calendars" />} />
        <Route path="/master-data/resource-calendars/:id/edit" element={<PlanningConstraintsScreen entity="resource-calendars" />} />
        <Route path="/console/mes/work-centers/*" element={<LegacyRedirect from="/console/mes/work-centers" to="/master-data/work-centers" />} />
        <Route path="/console/mes/i18n-review" element={<I18nReviewScreen />} />
        <Route path="/master-data/equipment/*" element={<LegacyRedirect from="/master-data/equipment" to="/master-data/machines" />} />
        <Route path="/master-data/machines" element={<ResourceFoundationScreen entity="machines" />} />
        <Route path="/master-data/machines/new" element={<ResourceFoundationScreen entity="machines" />} />
        <Route path="/master-data/machines/:id" element={<ResourceFoundationScreen entity="machines" />} />
        <Route path="/master-data/machines/:id/edit" element={<ResourceFoundationScreen entity="machines" />} />
        <Route path="/console/mes/equipment/*" element={<LegacyRedirect from="/console/mes/equipment" to="/master-data/machines" />} />
        <Route path="/master-data/production-standards/*" element={<LegacyRedirect from="/master-data/production-standards" to="/master-data/routings" />} />
        <Route path="/console/mes/production-standards/*" element={<LegacyRedirect from="/console/mes/production-standards" to="/master-data/routings" />} />
        <Route
          path="/master-data/reason-codes"
          element={
            <Tier2AdminScreen
              entityType="reason-codes"
              titleKey="tier2.reasonCodes.title"
              subtitleKey="tier2.reasonCodes.subtitle"
              icon={AlertTriangle}
            />
          }
        />
        <Route
          path="/console/mes/reason-codes"
          element={
            <Tier2AdminScreen
              entityType="reason-codes"
              titleKey="tier2.reasonCodes.title"
              subtitleKey="tier2.reasonCodes.subtitle"
              icon={AlertTriangle}
            />
          }
        />
        <Route
          path="/master-data/skills"
          element={<SkillManagementScreen />}
        />
        <Route path="/master-data/skills/:scope" element={<SkillManagementScreen />} />
        <Route path="/master-data/worker-skills/*" element={<LegacyRedirect from="/master-data/worker-skills" to="/master-data/skills/workers" />} />
        <Route path="/master-data/employee-skills/*" element={<LegacyRedirect from="/master-data/employee-skills" to="/employees" />} />
        <Route path="/worker-skills/*" element={<LegacyRedirect from="/worker-skills" to="/master-data/skills/workers" />} />
        <Route path="/console/mes/skills/*" element={<LegacyRedirect from="/console/mes/skills" to="/master-data/skills/workers" />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
    </RouteErrorBoundary>
  );
};

export default function App() {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  return (
    <AuthProvider>
      <I18nProvider i18n={mesConsoleI18n}>
        <BrowserRouter>
          <div className="h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground flex flex-col font-sans">
            <Navbar onMenuToggle={() => setMobileNavOpen((open) => !open)} />
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <Sidebar className="hidden md:block" />
              {mobileNavOpen ? <div className="fixed inset-0 z-50 flex md:hidden"><button type="button" className="absolute inset-0 bg-black/65" onClick={() => setMobileNavOpen(false)} aria-label={mesConsoleI18n.t('common.close')} /><Sidebar className="relative z-10 w-[min(20rem,85vw)] shadow-2xl" onNavigate={() => setMobileNavOpen(false)} /></div> : null}
              <main className="mes-main min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
                <div className="mb-4 space-y-3">
                  <RouteHeader />
                  <div className="flex justify-end">
                    <PageDetailButton />
                  </div>
                </div>
                <AppRoutes />
              </main>
            </div>
            <Toaster position="top-right" offset={16} theme="dark" richColors toastOptions={{ className: 'mes-toast' }} />
          </div>
        </BrowserRouter>
      </I18nProvider>
    </AuthProvider>
  );
}
