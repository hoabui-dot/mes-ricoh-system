import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CircleAlert, X } from 'lucide-react';

export type ValidationToastDetail = string | React.ReactNode;

export interface ValidationErrorToastProps {
  code: string;
  message: string;
  details?: ValidationToastDetail[];
  moreDetailsLabel: string;
  hideDetailsLabel: string;
  closeLabel: string;
  onClose?: () => void;
}

/** Reusable structured error toast for backend validation failures. */
export const ValidationErrorToast: React.FC<ValidationErrorToastProps> = ({
  code, message, details = [], moreDetailsLabel, hideDetailsLabel, closeLabel, onClose,
}) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="pointer-events-auto box-border w-full max-w-[30rem] rounded-lg border border-rose-800 bg-slate-950 p-3 text-slate-100 shadow-2xl">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-rose-200">{message}</div>
          {details.length > 0 && (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="pointer-events-auto mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200">
              {expanded ? hideDetailsLabel : moreDetailsLabel}
              {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          )}
          {expanded && <ul className="mt-2 space-y-1 border-t border-slate-800 pt-2 text-xs text-slate-300">{details.map((detail, index) => <li key={index} className="flex gap-2"><span className="text-rose-400">•</span><span>{detail}</span></li>)}</ul>}
        </div>
        {onClose && <button type="button" onClick={onClose} title={closeLabel} aria-label={closeLabel} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-100"><X className="h-4 w-4" aria-hidden="true" /></button>}
      </div>
    </div>
  );
};
