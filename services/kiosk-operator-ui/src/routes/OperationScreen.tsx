import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useKioskSocket } from '../context/KioskSocketContext';
import { ErrorBoundaryCard } from '../components/ErrorBoundaryCard';
import { Play, CheckCircle2, AlertOctagon, ArrowLeft, Loader2, QrCode, Layers } from 'lucide-react';
import { toast } from 'sonner';

export const OperationScreen: React.FC = () => {
  const { terminalId = 'KIOSK-MOLD-01', woId = '' } = useParams();
  const navigate = useNavigate();
  const { connectionStatus } = useKioskSocket();

  const [woData, setWoData] = useState<any>(null);
  const [selectedOp, setSelectedOp] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);

  const [qtyGood, setQtyGood] = useState<number>(100);
  const [qtyScrap, setQtyScrap] = useState<number>(0);
  const [reasonCode, setReasonCode] = useState<string>('');
  const [scannedLabelId, setScannedLabelId] = useState<string>('');
  const [scannedMatCode, setScannedMatCode] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorBoundaryState, setErrorBoundaryState] = useState<any>(null);
  const [showAbortModal, setShowAbortModal] = useState<boolean>(false);

  const fetchWODetails = async () => {
    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/execution/work-orders/${woId}`);
      if (!resp.ok) {
        throw { status: resp.status, message: 'Lệnh sản xuất không tồn tại' };
      }
      const data = await resp.json();
      setWoData(data);

      const ops = data.operations || [];
      if (ops.length > 0 && !selectedOp) {
        setSelectedOp(ops[0]);
      }
    } catch (err: any) {
      setErrorBoundaryState(err);
    }
  };

  useEffect(() => {
    fetchWODetails();
  }, [woId]);

  // Start Operation Handler (Pessimistic)
  const handleStartOperation = async () => {
    if (connectionStatus === 'disconnected') {
      toast.error('Không thể bắt đầu công đoạn khi đang mất kết nối!');
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});

    try {
      const host = window.location.hostname;
      const operatorId = localStorage.getItem('kiosk_operator_id') || 'operator01';
      const resp = await fetch(`http://${host}:18000/api/mes/execution/work-orders/${woId}/operations/${selectedOp.wo_operation_id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': operatorId,
        },
        body: JSON.stringify({ terminal_ref: terminalId }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || 'Bắt đầu công đoạn thất bại');
      }

      const session = await resp.json();
      setActiveSession(session);
      toast.success(`Đã bắt đầu ca thi công! Session: ${session.session_id.slice(0, 8)}`);
      await fetchWODetails();
    } catch (err: any) {
      setFieldErrors({ form: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm Operation Handler (Pessimistic Confirmation Only)
  const handleConfirmOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connectionStatus === 'disconnected') {
      toast.error('Không thể xác nhận khi mất kết nối mạng!');
      return;
    }

    // Layer 1 inline field validations
    const errors: Record<string, string> = {};
    if (selectedOp?.operation_code === 'OP-QC' && qtyScrap > 0 && !reasonCode) {
      errors.reasonCode = 'Vui lòng chọn Mã nguyên nhân phế phẩm đối với OP-QC kiểm định';
    }
    if (selectedOp?.operation_code === 'OP-PREP' && !scannedMatCode && !scannedLabelId) {
      errors.scannedMatCode = 'Vui lòng quét Mã vật tư hoặc Mã Tem nhãn trước khi xác nhận';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});

    try {
      const host = window.location.hostname;
      const operatorId = localStorage.getItem('kiosk_operator_id') || 'operator01';
      const idempAttempt = `KIOSK-ATTEMPT-${Date.now()}`;

      const bodyPayload: any = {
        session_id: activeSession?.session_id || `MOCK-${Date.now()}`,
        qty_good: qtyGood,
        qty_scrap: qtyScrap,
        reason_code: reasonCode || undefined,
        scanned_label_id: scannedLabelId || undefined,
        scanned_material_code: scannedMatCode || undefined,
        idempotency_attempt: idempAttempt,
      };

      const resp = await fetch(`http://${host}:18000/api/mes/execution/work-orders/${woId}/operations/${selectedOp.wo_operation_id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': operatorId,
          'X-Role-Code': 'OPERATOR',
        },
        body: JSON.stringify(bodyPayload),
      });

      if (!resp.ok) {
        if (resp.status === 503) {
          throw { status: 503, message: 'Traceability service circuit breaker open' };
        }
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || 'Xác nhận công đoạn thất bại');
      }

      const conf = await resp.json();
      toast.success(`Đã xác nhận hoàn thành! Mã xác nhận: ${conf.confirmation_id.slice(0, 8)} ${conf.output_label_id ? `— Tem đã in: ${conf.output_label_id.slice(0, 8)}` : ''}`);

      setActiveSession(null);
      await fetchWODetails();
    } catch (err: any) {
      if (err.status === 503) {
        setErrorBoundaryState(err);
      } else {
        setFieldErrors({ form: err.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Abort Session Handler (Destructive)
  const handleAbortSession = async () => {
    if (!activeSession) return;
    setIsSubmitting(true);
    try {
      const host = window.location.hostname;
      const operatorId = localStorage.getItem('kiosk_operator_id') || 'operator01';
      await fetch(`http://${host}:18000/api/mes/execution/work-orders/${woId}/operations/${selectedOp.wo_operation_id}/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-ID': operatorId },
        body: JSON.stringify({ session_id: activeSession.session_id }),
      });
      toast.warning('Đã hủy bỏ phiên làm việc');
      setActiveSession(null);
      setShowAbortModal(false);
    } catch (err: any) {
      toast.error('Lỗi khi hủy phiên');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (errorBoundaryState) {
    return <ErrorBoundaryCard error={errorBoundaryState} onRetry={() => setErrorBoundaryState(null)} />;
  }

  const woHeader = woData?.header;
  const operations = woData?.operations || [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <button
          onClick={() => navigate(`/kiosk/${terminalId}/wo-list`)}
          className="flex items-center space-x-2 text-slate-400 hover:text-slate-100 transition"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-semibold">Trở về danh sách</span>
        </button>

        <div className="text-right">
          <span className="font-mono text-xl font-bold text-indigo-400">{woHeader?.wo_code}</span>
          <p className="text-xs text-slate-400">{woHeader?.item_name || woHeader?.item_code}</p>
        </div>
      </div>

      {/* Operation Routing Selector */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {operations.map((op: any) => (
          <button
            key={op.wo_operation_id}
            onClick={() => setSelectedOp(op)}
            className={`flex items-center space-x-2 px-4 py-3 rounded-xl border text-sm font-semibold whitespace-nowrap transition ${
              selectedOp?.wo_operation_id === op.wo_operation_id
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                : op.status === 'Finished'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="font-mono text-xs opacity-70">#{op.sequence_no}</span>
            <span>{op.operation_code}</span>
            {op.status === 'Finished' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          </button>
        ))}
      </div>

      {/* Selected Operation Execution Panel */}
      {selectedOp && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Công Đoạn: <span className="text-indigo-400">{selectedOp.operation_code}</span>
              </h2>
              <p className="text-xs text-slate-400">Trạng thái công đoạn: <span className="font-semibold text-slate-300">{selectedOp.status}</span></p>
            </div>

            {selectedOp.status !== 'Finished' && !activeSession && (
              <button
                onClick={handleStartOperation}
                disabled={isSubmitting || connectionStatus === 'disconnected'}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold py-3 px-6 rounded-xl flex items-center space-x-2 shadow-lg transition"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                <span>Bắt Đầu Công Đoạn</span>
              </button>
            )}
          </div>

          {/* Form level error message */}
          {fieldErrors.form && (
            <div className="bg-rose-950/60 border border-rose-800 text-rose-300 p-4 rounded-xl text-sm flex items-center space-x-2">
              <AlertOctagon className="w-5 h-5 shrink-0" />
              <span>{fieldErrors.form}</span>
            </div>
          )}

          {/* Execution Action Form */}
          <form onSubmit={handleConfirmOperation} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Inputs */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                    Sản Lượng Đạt (QTY Good)
                  </label>
                  <input
                    type="number"
                    value={qtyGood}
                    onChange={(e) => setQtyGood(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-slate-100 font-mono text-lg font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                    Sản Lượng Phế (QTY Scrap)
                  </label>
                  <input
                    type="number"
                    value={qtyScrap}
                    onChange={(e) => setQtyScrap(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl p-3 text-rose-400 font-mono text-lg font-bold"
                  />
                </div>

                {qtyScrap > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-rose-300 uppercase mb-2">
                      Mã Nguyên Nhân Phế *
                    </label>
                    <select
                      value={reasonCode}
                      onChange={(e) => setReasonCode(e.target.value)}
                      className="w-full bg-slate-950 border border-rose-800 rounded-xl p-3 text-slate-100"
                    >
                      <option value="">-- Chọn nguyên nhân --</option>
                      <option value="DEFECT-TEMP">DEFECT-TEMP (Lỗi nhiệt độ ép)</option>
                      <option value="DEFECT-FLASH">DEFECT-FLASH (Lỗi Bavia cao su)</option>
                      <option value="DEFECT-DIM">DEFECT-DIM (Sai kích thước)</option>
                    </select>
                    {fieldErrors.reasonCode && (
                      <p className="text-xs text-rose-400 mt-1">{fieldErrors.reasonCode}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                    Quét Mã Tem Nhãn (Label QR)
                  </label>
                  <div className="relative">
                    <QrCode className="w-5 h-5 text-slate-500 absolute left-3 top-3.5" />
                    <input
                      type="text"
                      value={scannedLabelId}
                      onChange={(e) => setScannedLabelId(e.target.value)}
                      placeholder="Quét tem nhãn..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-3 pl-11 pr-4 text-slate-100 font-mono text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                    Quét Mã Vật Tư (Material Code)
                  </label>
                  <div className="relative">
                    <Layers className="w-5 h-5 text-slate-500 absolute left-3 top-3.5" />
                    <input
                      type="text"
                      value={scannedMatCode}
                      onChange={(e) => setScannedMatCode(e.target.value)}
                      placeholder="Quét mã vật tư..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-3 pl-11 pr-4 text-slate-100 font-mono text-sm"
                    />
                  </div>
                  {fieldErrors.scannedMatCode && (
                    <p className="text-xs text-rose-400 mt-1">{fieldErrors.scannedMatCode}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              {activeSession ? (
                <button
                  type="button"
                  onClick={() => setShowAbortModal(true)}
                  className="px-4 py-3 bg-rose-950/40 border border-rose-900 text-rose-300 hover:bg-rose-900/60 rounded-xl text-sm font-semibold transition"
                >
                  Hủy Phiên Ca
                </button>
              ) : (
                <div />
              )}

              <button
                type="submit"
                disabled={isSubmitting || connectionStatus === 'disconnected'}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold py-3.5 px-8 rounded-xl flex items-center space-x-2 shadow-lg shadow-emerald-600/20 transition"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang chờ máy chủ xác nhận (Pessimistic)...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Xác Nhận Hoàn Thành Công Đoạn</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Abort Modal (AlertDialog) */}
      {showAbortModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100">Xác nhận Hủy Phiên Ca?</h3>
            <p className="text-sm text-slate-400">
              Hành động này sẽ đóng session hiện tại mà không ghi nhận sản lượng. Bạn có chắc chắn muốn hủy?
            </p>
            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => setShowAbortModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-xl transition"
              >
                Trở lại
              </button>
              <button
                onClick={handleAbortSession}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-semibold py-2.5 rounded-xl transition"
              >
                Đồng ý Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
