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
import { MbomScreen } from './routes/master-data/MbomScreen';
import { MbomCreateScreen } from './routes/master-data/MbomCreateScreen';
import { RoutingScreen } from './routes/master-data/RoutingScreen';
import { RoutingCreateScreen } from './routes/master-data/RoutingCreateScreen';
import { RoutingOperationsScreen } from './routes/master-data/RoutingOperationsScreen';
import { ProductionVersionScreen } from './routes/master-data/ProductionVersionScreen';
import { ProductionVersionCrudScreen } from './routes/master-data/ProductionVersionCrudScreen';
import { EbomScreen } from './routes/master-data/EbomScreen';
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
import { NotFoundScreen } from './routes/NotFoundScreen';

import { WOListScreen } from './routes/work-orders/WOListScreen';
import { WOCreateScreen } from './routes/work-orders/WOCreateScreen';
import { WODetailScreen } from './routes/work-orders/WODetailScreen';
import { Wrench, Gauge, AlertTriangle, Award } from 'lucide-react';

const AppRoutes: React.FC = () => {
  const location = useLocation();

  return (
    <RouteErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<Navigate to="/work-orders" replace />} />

        {/* Area B: Work Order Planning */}
        <Route path="/work-orders" element={<WOListScreen />} />
        <Route path="/work-orders/new" element={<WOCreateScreen />} />
        <Route path="/work-orders/:id" element={<WODetailScreen />} />
        <Route path="/console/mes/work-orders" element={<WOListScreen />} />
        <Route path="/console/mes/work-orders/new" element={<WOCreateScreen />} />
        <Route path="/console/mes/work-orders/:id" element={<WODetailScreen />} />

        {/* Area A: Tier 1 Master Data Admin */}
        <Route path="/master-data/items" element={<ItemsScreen />} />
        <Route path="/master-data/mboms" element={<MbomScreen />} />
        <Route path="/master-data/mboms/new" element={<MbomCreateScreen />} />
        <Route path="/master-data/mboms/:id" element={<MbomScreen />} />
        <Route path="/master-data/routings" element={<RoutingScreen />} />
        <Route path="/master-data/routings/new" element={<RoutingCreateScreen />} />
        <Route path="/master-data/routings/:id/operations" element={<RoutingOperationsScreen />} />
        <Route path="/master-data/production-versions" element={<ProductionVersionScreen />} />
        <Route path="/master-data/production-versions/new" element={<ProductionVersionCrudScreen />} />
        <Route path="/master-data/production-versions/:id/edit" element={<ProductionVersionCrudScreen />} />
        <Route path="/master-data/eboms" element={<EbomScreen />} />
        <Route path="/master-data/operations" element={<OperationCatalogScreen />} />
        <Route path="/master-data/operations/new" element={<OperationCatalogScreen />} />
        <Route path="/master-data/operations/:id" element={<OperationCatalogScreen />} />
        <Route path="/master-data/operations/:id/edit" element={<OperationCatalogScreen />} />
        <Route path="/master-data/production-areas" element={<ResourceFoundationScreen entity="production-areas" />} />
        <Route path="/master-data/production-areas/new" element={<ResourceFoundationScreen entity="production-areas" />} />
        <Route path="/master-data/production-areas/:id" element={<ResourceFoundationScreen entity="production-areas" />} />
        <Route path="/master-data/production-areas/:id/edit" element={<ResourceFoundationScreen entity="production-areas" />} />
        <Route path="/master-data/factories" element={<ResourceFoundationScreen entity="factories" />} />
        <Route path="/master-data/factories/new" element={<ResourceFoundationScreen entity="factories" />} />
        <Route path="/master-data/factories/:id" element={<ResourceFoundationScreen entity="factories" />} />
        <Route path="/master-data/factories/:id/edit" element={<ResourceFoundationScreen entity="factories" />} />
        <Route path="/master-data/shopfloors" element={<ResourceFoundationScreen entity="shopfloors" />} />
        <Route path="/master-data/shopfloors/new" element={<ResourceFoundationScreen entity="shopfloors" />} />
        <Route path="/master-data/shopfloors/:id" element={<ResourceFoundationScreen entity="shopfloors" />} />
        <Route path="/master-data/shopfloors/:id/edit" element={<ResourceFoundationScreen entity="shopfloors" />} />
        <Route path="/master-data/product-recipes" element={<Navigate to="/master-data/production-versions" replace />} />
        <Route path="/console/mes/items" element={<ItemsScreen />} />
        <Route path="/console/mes/routings" element={<RoutingScreen />} />
        <Route path="/console/mes/production-versions" element={<ProductionVersionScreen />} />
        <Route path="/employees" element={<EmployeesScreen />} />
        <Route path="/shifts" element={<ShiftsScreen />} />
        <Route path="/work-calendar" element={<WorkCalendarScreen />} />
        <Route path="/console/mes/employees" element={<EmployeesScreen />} />
        <Route path="/console/mes/shifts" element={<ShiftsScreen />} />
        <Route path="/console/mes/work-calendar" element={<WorkCalendarScreen />} />
        <Route path="/console/mes/mboms" element={<MbomScreen />} />
        <Route path="/console/mes/mboms/:id" element={<MbomScreen />} />

        {/* Area A: Tier 2 Master Data Admin */}
        <Route path="/master-data/work-centers" element={<WorkCentersScreen />} />
        <Route path="/master-data/work-centers/new" element={<ResourceFoundationScreen entity="work-centers" />} />
        <Route path="/master-data/work-centers/:id" element={<ResourceFoundationScreen entity="work-centers" />} />
        <Route path="/master-data/work-centers/:id/edit" element={<ResourceFoundationScreen entity="work-centers" />} />
        <Route path="/master-data/workstations" element={<ResourceFoundationScreen entity="workstations" />} />
        <Route path="/master-data/workstations/new" element={<ResourceFoundationScreen entity="workstations" />} />
        <Route path="/master-data/workstations/:id" element={<ResourceFoundationScreen entity="workstations" />} />
        <Route path="/master-data/workstations/:id/edit" element={<ResourceFoundationScreen entity="workstations" />} />
        <Route path="/master-data/resource-assignments" element={<ResourceFoundationScreen entity="resource-assignments" />} />
        <Route path="/master-data/resource-assignments/new" element={<ResourceFoundationScreen entity="resource-assignments" />} />
        <Route path="/master-data/resource-capabilities" element={<PlanningConstraintsScreen entity="resource-capabilities" />} />
        <Route path="/master-data/resource-capabilities/new" element={<PlanningConstraintsScreen entity="resource-capabilities" />} />
        <Route path="/master-data/resource-capabilities/:id" element={<PlanningConstraintsScreen entity="resource-capabilities" />} />
        <Route path="/master-data/resource-capabilities/:id/edit" element={<PlanningConstraintsScreen entity="resource-capabilities" />} />
        <Route path="/master-data/resource-calendars" element={<PlanningConstraintsScreen entity="resource-calendars" />} />
        <Route path="/master-data/resource-calendars/new" element={<PlanningConstraintsScreen entity="resource-calendars" />} />
        <Route path="/master-data/resource-calendars/:id" element={<PlanningConstraintsScreen entity="resource-calendars" />} />
        <Route path="/master-data/resource-calendars/:id/edit" element={<PlanningConstraintsScreen entity="resource-calendars" />} />
        <Route path="/master-data/operation-skill-requirements" element={<PlanningConstraintsScreen entity="operation-skill-requirements" />} />
        <Route path="/master-data/operation-skill-requirements/new" element={<PlanningConstraintsScreen entity="operation-skill-requirements" />} />
        <Route path="/master-data/operation-skill-requirements/:id" element={<PlanningConstraintsScreen entity="operation-skill-requirements" />} />
        <Route path="/master-data/operation-skill-requirements/:id/edit" element={<PlanningConstraintsScreen entity="operation-skill-requirements" />} />
        <Route path="/console/mes/work-centers" element={<WorkCentersScreen />} />
        <Route path="/console/mes/i18n-review" element={<I18nReviewScreen />} />
        <Route
          path="/master-data/equipment"
          element={
            <Tier2AdminScreen
              entityType="equipment"
              titleKey="tier2.equipment.title"
              subtitleKey="tier2.equipment.subtitle"
              icon={Wrench}
            />
          }
        />
        <Route path="/master-data/equipment/new" element={<ResourceFoundationScreen entity="equipment" />} />
        <Route path="/master-data/equipment/:id" element={<ResourceFoundationScreen entity="equipment" />} />
        <Route path="/master-data/equipment/:id/edit" element={<ResourceFoundationScreen entity="equipment" />} />
        <Route path="/master-data/machines" element={<ResourceFoundationScreen entity="machines" />} />
        <Route path="/master-data/machines/new" element={<ResourceFoundationScreen entity="machines" />} />
        <Route path="/master-data/machines/:id" element={<ResourceFoundationScreen entity="machines" />} />
        <Route path="/master-data/machines/:id/edit" element={<ResourceFoundationScreen entity="machines" />} />
        <Route
          path="/console/mes/equipment"
          element={
            <Tier2AdminScreen
              entityType="equipment"
              titleKey="tier2.equipment.title"
              subtitleKey="tier2.equipment.subtitle"
              icon={Wrench}
            />
          }
        />
        <Route
          path="/master-data/production-standards"
          element={<PlanningConstraintsScreen entity="production-standards" />}
        />
        <Route path="/master-data/production-standards/new" element={<PlanningConstraintsScreen entity="production-standards" />} />
        <Route path="/master-data/production-standards/:id" element={<PlanningConstraintsScreen entity="production-standards" />} />
        <Route path="/master-data/production-standards/:id/edit" element={<PlanningConstraintsScreen entity="production-standards" />} />
        <Route
          path="/console/mes/production-standards"
          element={<PlanningConstraintsScreen entity="production-standards" />}
        />
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
        <Route path="/master-data/worker-skills" element={<Navigate to="/master-data/skills/workers" replace />} />
        <Route path="/master-data/employee-skills" element={<Navigate to="/master-data/skills/workers" replace />} />
        <Route path="/worker-skills" element={<Navigate to="/master-data/skills/workers" replace />} />
        <Route
          path="/console/mes/skills"
          element={
            <Tier2AdminScreen
              entityType="skills"
              titleKey="tier2.skills.title"
              subtitleKey="tier2.skills.subtitle"
              icon={Award}
            />
          }
        />
        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
    </RouteErrorBoundary>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <I18nProvider i18n={mesConsoleI18n}>
        <BrowserRouter>
          <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
            <Navbar />
            <div className="flex flex-1 overflow-hidden">
              <Sidebar />
              <main className="mes-main flex-1 overflow-y-auto p-4 md:p-6 h-[calc(100vh-4rem)]">
                <div className="mb-4 space-y-3">
                  <RouteHeader />
                  <div className="flex justify-end">
                    <PageDetailButton />
                  </div>
                </div>
                <AppRoutes />
              </main>
            </div>
            <Toaster position="top-right" theme="dark" richColors />
          </div>
        </BrowserRouter>
      </I18nProvider>
    </AuthProvider>
  );
}
