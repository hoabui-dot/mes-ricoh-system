import React from 'react';
import { useKioskSocket } from '../context/KioskSocketContext';
import { WifiOff, AlertTriangle } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';

export const OfflineBanner: React.FC = () => {
  const { connectionStatus } = useKioskSocket();
  const { t } = useI18n();

  if (connectionStatus === 'connected') {
    return null;
  }

  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-50 flex items-center justify-between bg-amber-700 px-4 py-3 text-sm font-medium text-amber-50 shadow-lg">
      <div className="flex items-center space-x-2">
        <WifiOff className="w-5 h-5 shrink-0" />
        <span>
          {connectionStatus === 'connecting'
            ? t('kiosk.offline.connecting')
            : t('kiosk.offline.disconnected')}
        </span>
      </div>
      <div className="flex items-center space-x-1 text-xs bg-amber-800/80 px-2 py-1 rounded">
        <AlertTriangle className="w-4 h-4 text-amber-200" />
        <span>{t('kiosk.offline.label')}</span>
      </div>
    </div>
  );
};
