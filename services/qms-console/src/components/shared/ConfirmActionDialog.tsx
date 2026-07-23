import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui';

export function ConfirmActionDialog({ open, onOpenChange, title, body, confirmLabel, cancelLabel, loading, error, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
  error?: string;
  onConfirm: () => void;
}) {
  return <AlertDialog.Root open={open} onOpenChange={(next) => { if (!loading) onOpenChange(next); }}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="fixed inset-0 z-50 bg-slate-950/55" />
      <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-6 shadow-xl focus:outline-none">
        <div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning"><AlertTriangle className="h-5 w-5" /></div><div><AlertDialog.Title className="text-base font-bold">{title}</AlertDialog.Title><AlertDialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">{body}</AlertDialog.Description>{error ? <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}</div></div>
        <div className="mt-6 flex justify-end gap-2"><AlertDialog.Cancel asChild><Button type="button" variant="outline" disabled={loading}>{cancelLabel}</Button></AlertDialog.Cancel><Button type="button" disabled={loading} onClick={onConfirm}>{loading ? '...' : confirmLabel}</Button></div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
