import { SquareArrowOutUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLocalizedText } from '@mom-platform/i18n-ui-shared';
import type { Bin } from '../../../lib/api/types';

type Props = { bins: Bin[]; locationId: string; label: string; availableLabel: string; movementBinLabel: string; openLocationLabel: string; actualBinId?: string | null };

export function LocationHierarchyBins({ bins, locationId, label, availableLabel, movementBinLabel, openLocationLabel, actualBinId }: Props) {
  const resolve = useLocalizedText();
  if (bins.length === 0) return null;
  const actualBin = actualBinId ? bins.find((bin) => bin.bin_id === actualBinId) : undefined;
  const shownBins = actualBin ? [actualBin] : bins;
  return <div className="mt-2 flex items-start gap-2 border-t border-border/70 pt-2"><details className="min-w-0 flex-1 text-xs" open={Boolean(actualBin)}><summary className="cursor-pointer font-semibold text-muted-foreground">{actualBin ? movementBinLabel : `${label} · ${bins.length}`} </summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><span className="sr-only">{actualBin ? movementBinLabel : availableLabel}</span>{shownBins.map((bin) => <div key={bin.bin_id} className={`rounded border px-2 py-2 ${bin.bin_id === actualBinId ? 'border-action bg-action/10' : 'bg-secondary'}`} title={resolve(bin.bin_name as any) || bin.bin_code}><div className="font-mono font-bold text-foreground">{bin.bin_code}</div><div className="text-muted-foreground">{resolve(bin.bin_name as any) || '-'}</div><div className="mt-1 text-[11px] text-muted-foreground">{bin.status}</div></div>)}</div>{actualBin ? <div className="mt-1 text-[11px] text-muted-foreground">{availableLabel}: {bins.length}</div> : null}</details><Link className="mt-0.5 shrink-0 rounded p-1 text-action hover:bg-action/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-action" to={`/master-data/locations/${locationId}`} aria-label={openLocationLabel} title={openLocationLabel}><SquareArrowOutUpRight className="h-4 w-4" aria-hidden="true" /></Link></div>;
}
