import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { KioskSocketProvider } from './context/KioskSocketContext';
import { OfflineBanner } from './components/OfflineBanner';
import { LoginScreen } from './routes/LoginScreen';
import { WOListScreen } from './routes/WOListScreen';
import { OperationScreen } from './routes/OperationScreen';
import { Toaster } from 'sonner';
import { I18nProvider } from '@mom-platform/i18n-ui-shared';
import { kioskI18n } from './i18n';

export const App: React.FC = () => {
  return (
    <I18nProvider i18n={kioskI18n}>
      <KioskSocketProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
            <OfflineBanner />
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<Navigate to="/kiosk/KIOSK-MOLD-01/login" replace />} />
                <Route path="/kiosk/:terminalId/login" element={<LoginScreen />} />
                <Route path="/kiosk/:terminalId/wo-list" element={<WOListScreen />} />
                <Route path="/kiosk/:terminalId/wo/:woId" element={<OperationScreen />} />
                <Route path="*" element={<Navigate to="/kiosk/KIOSK-MOLD-01/login" replace />} />
              </Routes>
            </div>
            <Toaster position="top-right" theme="dark" richColors />
          </div>
        </BrowserRouter>
      </KioskSocketProvider>
    </I18nProvider>
  );
};
