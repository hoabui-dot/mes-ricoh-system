import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useI18n } from '@mom-platform/i18n-ui-shared';

export type BaseModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type BaseModalPlacement = 'top' | 'center';

export type BaseModalProps = {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  size?: BaseModalSize;
  placement?: BaseModalPlacement;
  loading?: boolean;
  loadingLabel?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  footer?: React.ReactNode;
  footerLeft?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  labelledBy?: string;
};

const sizeClasses: Record<BaseModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  full: 'max-w-none',
};

/** Public MES modal contract. External dialog primitives stay behind this component. */
export function BaseModal({
  open,
  title,
  onClose,
  children,
  size = 'lg',
  placement = 'top',
  loading = false,
  loadingLabel,
  confirmLabel,
  cancelLabel,
  onConfirm,
  confirmDisabled = false,
  footer,
  footerLeft,
  className,
  contentClassName,
  labelledBy = 'mes-base-modal-title',
}: BaseModalProps) {
  const { t } = useI18n();
  const placementClass = placement === 'center'
    ? 'top-[50%] max-h-[calc(100dvh-2rem)] translate-y-[-50%] rounded-lg'
    : 'top-0 translate-y-0 rounded-b-lg';
  const actions = footer || (confirmLabel || cancelLabel ? (
    <>
      {cancelLabel && <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>{cancelLabel}</Button>}
      {confirmLabel && <Button type="button" onClick={onConfirm} disabled={loading || confirmDisabled}>{loading ? (loadingLabel || t('common.loading')) : confirmLabel}</Button>}
    </>
  ) : null);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !loading) onClose(); }}>
      <DialogContent aria-labelledby={labelledBy} className={cn('z-[100] flex max-h-[100dvh] w-full flex-col gap-0 overflow-hidden border-border bg-surface p-0 text-foreground shadow-2xl', placementClass, sizeClasses[size], className)}>
        <DialogHeader className="flex shrink-0 flex-row items-start justify-between gap-4 border-b border-border bg-surface px-5 py-4 text-left">
          <DialogTitle id={labelledBy} className="min-w-0 text-lg font-bold text-foreground">{title}</DialogTitle>
        </DialogHeader>
        <div className={cn('min-h-0 flex-1 overflow-y-auto p-5', contentClassName)}>{children}</div>
        {(footerLeft || actions) && <DialogFooter className="flex shrink-0 flex-row items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4"><div className="flex items-center gap-2">{footerLeft}</div><div className="flex items-center gap-2">{actions}</div></DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
