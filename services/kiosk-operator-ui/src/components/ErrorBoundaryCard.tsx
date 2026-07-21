import React from 'react';
import { AlertOctagon, RefreshCw, ShieldAlert } from 'lucide-react';

interface ErrorBoundaryCardProps {
  error: any;
  onRetry?: () => void;
}

export const ErrorBoundaryCard: React.FC<ErrorBoundaryCardProps> = ({ error, onRetry }) => {
  const incidentId = React.useMemo(() => crypto.randomUUID().slice(0, 8), []);

  const isCircuitBreaker = error?.status === 503 || error?.message?.includes('circuit breaker');
  const isUnauthorized = error?.status === 401 || error?.status === 403;

  if (isUnauthorized) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-100">Phiên làm việc hết hạn</h2>
          <p className="text-sm text-slate-400">
            Vui lòng đăng nhập lại bằng Mã nhân viên và PIN để tiếp tục điều hành sản xuất.
          </p>
          <button
            onClick={() => (window.location.href = '/login')}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            Đăng nhập lại
          </button>
        </div>
      </div>
    );
  }

  if (isCircuitBreaker) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <AlertOctagon className="w-12 h-12 text-amber-500 mx-auto animate-pulse" />
          <h2 className="text-xl font-bold text-amber-100">Hệ thống đang quá tải / Tạm gián đoạn</h2>
          <p className="text-sm text-amber-200/80">
            Dịch vụ Truy xuất nguồn gốc / Điều hành đang phản hồi chậm. Vui lòng thử lại sau ít giây.
          </p>
          <div className="text-xs font-mono text-slate-500 bg-slate-950 p-2 rounded">
            Mã sự cố: {incidentId}
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Thử lại ngay</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
        <AlertOctagon className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-100">Đã có lỗi hệ thống</h2>
        <p className="text-sm text-slate-400">
          Đã ghi nhận sự cố bất ngờ. Vui lòng báo cho Tổ trưởng / Quản trị hệ thống với mã sự cố bên dưới.
        </p>
        <div className="text-xs font-mono text-rose-400 bg-slate-950 p-2 rounded border border-rose-900/50">
          Mã sự cố: INC-{incidentId}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Tải lại trang</span>
          </button>
        )}
      </div>
    </div>
  );
};
