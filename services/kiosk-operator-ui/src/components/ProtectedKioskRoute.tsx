import React from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { hasAuthenticatedTerminalSession } from '../lib/auth';

export const ProtectedKioskRoute: React.FC = () => {
  const { terminalId = 'KIOSK-DEMO-01' } = useParams();
  const location = useLocation();
  if (!hasAuthenticatedTerminalSession(terminalId)) {
    return <Navigate to={`/kiosk/${encodeURIComponent(terminalId)}/login`} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
};
