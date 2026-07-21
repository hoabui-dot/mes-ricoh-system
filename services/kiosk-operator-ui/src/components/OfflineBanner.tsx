import React from 'react';
import { useKioskSocket } from '../context/KioskSocketContext';
import { WifiOff, AlertTriangle } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const { connectionStatus } = useKioskSocket();

  if (connectionStatus === 'connected') {
    return null;
  }

  return (
    <div className="bg-amber-600/90 text-amber-50 px-4 py-2 text-sm font-medium flex items-center justify-between shadow-lg backdrop-blur sticky top-0 z-50 animate-pulse">
      <div className="flex items-center space-x-2">
        <WifiOff className="w-5 h-5 shrink-0" />
        <span>
          {connectionStatus === 'connecting'
            ? 'Đang kết nối lại máy chủ shopfloor (WebSocket)...'
            : 'Mất kết nối máy chủ realtime! Màn hình đang ở chế độ xem ngoại tuyến. Mọi thao tác xác nhận thể chất tạm thời bị khóa.'}
        </span>
      </div>
      <div className="flex items-center space-x-1 text-xs bg-amber-800/80 px-2 py-1 rounded">
        <AlertTriangle className="w-4 h-4 text-amber-200" />
        <span>Khai báo ngoại tuyến</span>
      </div>
    </div>
  );
};
