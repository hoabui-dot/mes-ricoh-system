import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { I18nProvider } from '@mom-platform/i18n-ui-shared';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { PageDetailButton } from './components/PageDetailButton';
import { Toaster } from 'sonner';
import { mesConsoleI18n } from './i18n';

import { ItemsScreen } from './routes/master-data/ItemsScreen';
import { MbomScreen } from './routes/master-data/MbomScreen';
import { RoutingScreen } from './routes/master-data/RoutingScreen';
import { ProductionVersionScreen } from './routes/master-data/ProductionVersionScreen';
import { Tier2AdminScreen } from './routes/master-data/Tier2AdminScreen';
import { WorkCentersScreen } from './routes/master-data/WorkCentersScreen';
import { I18nReviewScreen } from './routes/master-data/I18nReviewScreen';
import { EmployeesScreen } from './routes/master-data/EmployeesScreen';
import { ShiftsScreen } from './routes/master-data/ShiftsScreen';
import { WorkCalendarScreen } from './routes/master-data/WorkCalendarScreen';
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
        <Route path="/master-data/mboms/:id" element={<MbomScreen />} />
        <Route path="/master-data/routings" element={<RoutingScreen />} />
        <Route path="/master-data/production-versions" element={<ProductionVersionScreen />} />
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
        <Route path="/console/mes/work-centers" element={<WorkCentersScreen />} />
        <Route path="/console/mes/i18n-review" element={<I18nReviewScreen />} />
        <Route
          path="/master-data/equipment"
          element={
            <Tier2AdminScreen
              entityType="equipment"
              title="Thiết Bị & Máy Móc (Equipment)"
              subtitle="Danh mục máy ép lưu hóa, máy cắt, máy trộn cao su"
              icon={Wrench}
            />
          }
        />
        <Route
          path="/console/mes/equipment"
          element={
            <Tier2AdminScreen
              entityType="equipment"
              title="Thiết Bị & Máy Móc (Equipment)"
              subtitle="Danh mục máy ép lưu hóa, máy cắt, máy trộn cao su"
              icon={Wrench}
            />
          }
        />
        <Route
          path="/master-data/production-standards"
          element={
            <Tier2AdminScreen
              entityType="production-standards"
              title="Định Mức Năng Suất (Standards)"
              subtitle="Thời lượng tiêu chuẩn & Takt Time từng công đoạn"
              icon={Gauge}
            />
          }
        />
        <Route
          path="/console/mes/production-standards"
          element={
            <Tier2AdminScreen
              entityType="production-standards"
              title="Định Mức Năng Suất (Standards)"
              subtitle="Thời lượng tiêu chuẩn & Takt Time từng công đoạn"
              icon={Gauge}
            />
          }
        />
        <Route
          path="/master-data/reason-codes"
          element={
            <Tier2AdminScreen
              entityType="reason-codes"
              title="Mã Nguyên Nhân Phế (Reason Codes)"
              subtitle="Danh mục nguyên nhân loại bỏ phế phẩm hoặc bọt khí"
              icon={AlertTriangle}
            />
          }
        />
        <Route
          path="/console/mes/reason-codes"
          element={
            <Tier2AdminScreen
              entityType="reason-codes"
              title="Mã Nguyên Nhân Phế (Reason Codes)"
              subtitle="Danh mục nguyên nhân loại bỏ phế phẩm hoặc bọt khí"
              icon={AlertTriangle}
            />
          }
        />
        <Route
          path="/master-data/skills"
          element={
            <Tier2AdminScreen
              entityType="skills"
              title="Kỹ Năng Vận Hành (Skills)"
              subtitle="Chứng chỉ & kỹ năng yêu cầu cho công nhân trạm ép"
              icon={Award}
            />
          }
        />
        <Route
          path="/console/mes/skills"
          element={
            <Tier2AdminScreen
              entityType="skills"
              title="Kỹ Năng Vận Hành (Skills)"
              subtitle="Chứng chỉ & kỹ năng yêu cầu cho công nhân trạm ép"
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
              <main className="flex-1 p-4 md:p-6 overflow-y-auto h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top_right,rgba(234,88,12,0.08),transparent_34%),linear-gradient(180deg,rgba(8,47,73,0.22),transparent_260px)]">
                <div className="mb-3 flex justify-end">
                  <PageDetailButton />
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
