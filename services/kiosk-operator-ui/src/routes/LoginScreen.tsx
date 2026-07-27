import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useKioskSocket } from '../context/KioskSocketContext';
import { ShieldCheck, UserCheck, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_LOCALES, languageNames, useI18n, type SupportedLocale } from '@mom-platform/i18n-ui-shared';

export const LoginScreen: React.FC = () => {
  const { terminalId = 'KIOSK-DEMO-01' } = useParams();
  const navigate = useNavigate();
  const { connectSocket } = useKioskSocket();
  const { locale, setLocale, t } = useI18n();

  const [employeeId, setEmployeeId] = useState('operator01');
  const [pin, setPin] = useState('Operator@123!');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !pin) {
      setErrorMsg('Vui lòng nhập Mã nhân viên và Mật khẩu / PIN');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const host = window.location.hostname;
      const resp = await fetch(`http://${host}:18000/api/mes/kiosk-gateway/terminals/${terminalId}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, pin }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Đăng nhập thất bại (Mã: ${resp.status})`);
      }

      const data = await resp.json();
      localStorage.setItem('kiosk_access_token', data.access_token);
      localStorage.setItem('kiosk_operator_id', data.user_id || employeeId);
      localStorage.setItem('kiosk_terminal_id', terminalId);

      connectSocket(terminalId, data.access_token);
      toast.success(`Đăng nhập thành công! Chào mừng ${data.username || employeeId}`);

      navigate(`/kiosk/${terminalId}/wo-list`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi kết nối tới cổng Kiosk Gateway');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto text-indigo-400">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{t('kiosk.title')}</h1>
          <p className="text-xs text-slate-400 font-mono">{t('kiosk.device', { terminalId })}</p>
          <select value={locale} onChange={(event) => setLocale(event.target.value as SupportedLocale)} className="mt-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs">
            {SUPPORTED_LOCALES.map((item) => <option key={item} value={item}>{languageNames[item]}</option>)}
          </select>
        </div>

        {errorMsg && (
          <div className="bg-rose-950/60 border border-rose-800/80 text-rose-300 text-sm p-3 rounded-lg flex items-center space-x-2">
            <span>⚠️ {errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              {t('kiosk.employee')}
            </label>
            <div className="relative">
              <UserCheck className="w-5 h-5 text-slate-500 absolute left-3 top-3.5" />
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="Nhập mã NV..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-3 pl-11 pr-4 text-slate-100 placeholder-slate-600 focus:outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              {t('kiosk.password')}
            </label>
            <div className="relative">
              <KeyRound className="w-5 h-5 text-slate-500 absolute left-3 top-3.5" />
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-3 pl-11 pr-4 text-slate-100 placeholder-slate-600 focus:outline-none transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{t('kiosk.authenticating')}</span>
              </>
            ) : (
              <span>{t('kiosk.login')}</span>
            )}
          </button>
        </form>

        <div className="text-center text-xs text-slate-600">
          S-Factory MOM Platform — Shopfloor Kiosk Gateway v1.0
        </div>
      </div>
    </div>
  );
};
