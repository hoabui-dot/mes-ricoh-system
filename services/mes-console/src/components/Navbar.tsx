import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, Shield } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/30">
          W
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-100">Won Seal Tech — MES Console</h1>
          <p className="text-xs text-slate-400">Master Data Admin & Work Order Planning</p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-3 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
          <div className="w-8 h-8 bg-indigo-950 border border-indigo-800 rounded-lg flex items-center justify-center text-indigo-400">
            <User className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-slate-200">{user?.username}</div>
            <div className="text-[10px] font-mono text-indigo-400 flex items-center space-x-1">
              <Shield className="w-3 h-3" />
              <span>{user?.roles[0] || 'OPERATOR'}</span>
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="p-2 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 rounded-xl transition border border-transparent hover:border-rose-800"
          title="Đăng xuất"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
