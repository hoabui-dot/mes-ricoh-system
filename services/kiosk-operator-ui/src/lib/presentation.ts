import type { KioskActionEligibility, KioskNamedResource } from '../types/kiosk';

const knownWorkOrderStates = new Set(['Draft', 'Approved', 'Released', 'InProgress', 'Paused', 'Completed', 'Rejected']);
const knownDisplayStates = new Set(['waiting', 'ready', 'in_progress', 'completed', 'failed', 'blocked']);
const knownPredecessorStates = new Set(['NOT_REQUIRED', 'COMPLETED', 'BLOCKED']);
const knownPrintStates = new Set(['NotRequired', 'Queued', 'DispatchQueued', 'InProgress', 'Completed', 'Failed', 'Printed']);
const knownBlockers = new Set([
  'OPERATION_ALREADY_COMPLETED',
  'WORK_ORDER_NOT_PAUSED',
  'OPERATION_FAILURE_HISTORY_NOT_FOUND',
  'TERMINAL_SCOPE_MISMATCH',
  'EXECUTION_SESSION_NOT_ACTIVE',
  'ACTIVE_SESSION_REQUIRED',
  'WORK_ORDER_STATE_NOT_EXECUTABLE',
  'WORK_ORDER_NOT_EXECUTABLE',
  'WORK_ORDER_PAUSED',
  'PREDECESSOR_NOT_FINISHED',
  'RESOURCE_ALLOCATION_NOT_COMMITTED',
  'RESOURCE_ALLOCATION_REQUIRED',
  'OPERATION_NOT_READY',
]);

export const workOrderStateKey = (state: string) =>
  knownWorkOrderStates.has(state) ? `kiosk.woState.${state}` : 'kiosk.state.unknown';

export const displayStateKey = (state: string) =>
  knownDisplayStates.has(state) ? `kiosk.jobState.${state}` : 'kiosk.state.unknown';

export const predecessorStateKey = (state: string) =>
  knownPredecessorStates.has(state) ? `kiosk.predecessor.${state}` : 'kiosk.state.unknown';

export const printStateKey = (state?: string) =>
  state && knownPrintStates.has(state) ? `kiosk.printState.${state}` : 'kiosk.state.unknown';

export const blockerKey = (code: string) =>
  knownBlockers.has(code) ? `kiosk.blocker.${code}` : 'kiosk.blocker.unknown';

export const stateTone = (state: string) => {
  switch (state) {
    case 'completed':
    case 'Completed':
    case 'Finished':
      return 'border-emerald-700 bg-emerald-950/50 text-emerald-200';
    case 'in_progress':
    case 'InProgress':
      return 'border-cyan-700 bg-cyan-950/50 text-cyan-200';
    case 'failed':
    case 'ExecutionError':
    case 'Failed':
      return 'border-rose-700 bg-rose-950/50 text-rose-200';
    case 'blocked':
    case 'Paused':
      return 'border-amber-700 bg-amber-950/50 text-amber-200';
    case 'ready':
    case 'Released':
      return 'border-indigo-700 bg-indigo-950/50 text-indigo-200';
    default:
      return 'border-slate-700 bg-slate-800 text-slate-200';
  }
};

export const eligibleActions = (eligibility: KioskActionEligibility): string[] => {
  const actions: string[] = [];
  if (eligibility.can_start) actions.push('start');
  if (eligibility.can_complete) actions.push('complete');
  if (eligibility.can_fail) actions.push('fail');
  if (eligibility.can_abort) actions.push('abort');
  if (eligibility.can_retry) actions.push('retry');
  return actions;
};

export const displayResource = (
  resource: KioskNamedResource | undefined,
  resolveText: (value: KioskNamedResource['name_i18n']) => string,
  fallback: string,
) => resource?.code || resolveText(resource?.name_i18n) || fallback;

export const formatDateTime = (locale: string, value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export const formatCacheAge = (locale: string, value?: string) => {
  if (!value) return '';
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (elapsedSeconds < 60) return relative.format(-elapsedSeconds, 'second');
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return relative.format(-minutes, 'minute');
  return relative.format(-Math.floor(minutes / 60), 'hour');
};
