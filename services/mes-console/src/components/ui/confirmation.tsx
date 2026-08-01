import React from 'react';
import { BaseModal } from '../base/BaseModal';
import { Button } from './button';

export type ConfirmationProps = {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  destructive?: boolean;
  loading?: boolean;
};

export function Confirmation({ open, title, description, confirmLabel, cancelLabel, onConfirm, onClose, destructive = false, loading = false }: ConfirmationProps) {
  return <BaseModal
    open={open}
    title={title}
    onClose={onClose}
    size="sm"
    placement="center"
    footerLeft={<Button type="button" variant="secondary" disabled={loading} onClick={onClose}>{cancelLabel}</Button>}
    footer={<Button type="button" variant={destructive ? 'destructive' : 'default'} disabled={loading} onClick={onConfirm}>{confirmLabel}</Button>}
  >
    <div className="text-sm text-muted-foreground">{description}</div>
  </BaseModal>;
}
