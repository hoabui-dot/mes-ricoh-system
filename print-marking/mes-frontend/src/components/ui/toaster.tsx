import React from 'react'
import { useToastStore } from '@/stores/toast.store'
import { CheckCircle2, AlertCircle, X, Info } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

export function Toaster() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            className="pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-xl border bg-white text-slate-800"
            style={{
              borderColor:
                t.type === 'success'
                  ? 'var(--color-status-success)'
                  : t.type === 'error'
                  ? 'var(--color-status-danger)'
                  : 'var(--color-status-info)',
            }}
          >
            {t.type === 'success' && <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={16} />}
            {t.type === 'error' && <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={16} />}
            {t.type === 'info' && <Info className="text-blue-500 shrink-0 mt-0.5" size={16} />}

            <div className="flex-1 text-xs font-semibold">{t.message}</div>

            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-slate-600 shrink-0"
              type="button"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
