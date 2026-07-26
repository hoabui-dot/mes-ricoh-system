import React from 'react';
import { cn } from '../../lib/utils';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './dialog';

export type ModalProps = {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footerLeft?: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  className?: string;
  labelledBy?: string;
};

/** Canonical dialog surface: above the sticky navbar, content-sized, and internally scrollable. */
export function Modal({ open, title, onClose, children, footerLeft, footer, headerActions, className, labelledBy = 'mes-modal-title' }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent aria-labelledby={labelledBy} className={cn('z-[100] flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col gap-0 overflow-hidden border-border bg-surface p-0 text-foreground shadow-2xl sm:max-h-[calc(100vh-3rem)]', className)}>
        <DialogHeader className="flex shrink-0 flex-row items-start justify-between gap-4 border-b border-border bg-surface px-5 py-4 text-left">
          <DialogTitle id={labelledBy} className="min-w-0 text-lg font-bold text-foreground">{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {(footerLeft || headerActions || footer) && <DialogFooter className="flex shrink-0 flex-row items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4"><div className="flex items-center gap-2">{footerLeft || headerActions}</div><div className="flex items-center gap-2">{footer}</div></DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
