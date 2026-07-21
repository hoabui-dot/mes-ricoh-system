import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Toaster } from 'sonner';

import { ItemsScreen } from './routes/master-data/ItemsScreen';
import { MbomScreen } from './routes/master-data/MbomScreen';
import { RoutingScreen } from './routes/master-data/RoutingScreen';
import { ProductionVersionScreen } from './routes/master-data/ProductionVersionScreen';
import { Tier2AdminScreen } from './routes/master-data/Tier2AdminScreen';

import { WOListScreen } from './routes/work-orders/WOListScreen';
import { WOCreateScreen } from './routes/work-orders/WOCreateScreen';
import { WODetailScreen } from './routes/work-orders/WODetailScreen';
import { Factory, Wrench, Gauge, AlertTriangle, Award } from 'lucide-react';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
          <Navbar />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 p-6 overflow-y-auto h-[calc(100vh-4rem)]">
              <Routes>
                <Route path="/" element={<Navigate to="/work-orders" replace />} />
                
                {/* Area B: Work Order Planning */}
                <Route path="/work-orders" element={<WOListScreen />} />
                <Route path="/work-orders/new" element={<WOCreateScreen />} />
                <Route path="/work-orders/:id" element={<WODetailScreen />} />

                {/* Area A: Tier 1 Master Data Admin */}
                <Route path="/master-data/items" element={<ItemsScreen />} />
                <Route path="/master-data/mboms" element={<MbomScreen />} />
                <Route path="/master-data/routings" element={<RoutingScreen />} />
                <Route path="/master-data/production-versions" element={<ProductionVersionScreen />} />

                {/* Area A: Tier 2 Master Data Admin */}
                <Route
                  path="/master-data/work-centers"
                  element={
                    <Tier2AdminScreen
                      entityType="work-centers"
                      title="Trạm Sản Xuất (WorkCenter)"
                      subtitle="Quản lý các trạm máy shopfloor (MIX, PREP, CUT, MOLD, TRIM, QC)"
                      icon={Factory}
                    />
                  }
                />
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
              </Routes>
            </main>
          </div>
          <Toaster position="top-right" theme="dark" richColors />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
