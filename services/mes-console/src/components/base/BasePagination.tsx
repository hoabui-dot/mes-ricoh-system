import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import { useI18n } from '@mom-platform/i18n-ui-shared';

export function BasePagination({ page, pageCount, onPageChange, previousLabel, nextLabel }: { page: number; pageCount: number; onPageChange: (page: number) => void; previousLabel?: React.ReactNode; nextLabel?: React.ReactNode }) {
  const { t } = useI18n();
  previousLabel = previousLabel || t('table.previous');
  nextLabel = nextLabel || t('table.next');
  return <div className="flex items-center justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ArrowLeft className="h-4 w-4" />{previousLabel}</Button><span className="min-w-16 text-center text-xs font-semibold text-muted-foreground">{page} / {Math.max(pageCount, 1)}</span><Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>{nextLabel}<ArrowRight className="h-4 w-4" /></Button></div>;
}
