import React, { useMemo } from 'react';
import { useI18n, useLocalizedText } from '@mom-platform/i18n-ui-shared';
import { ComboboxBase, FieldHelpPopover, SelectBase } from './ui';

type RevisionRecord = Record<string, any>;

export type ItemRevisionSelectorProps = {
  revisions: RevisionRecord[];
  itemValue: string;
  revisionValue: string;
  onItemValueChange: (itemId: string) => void;
  onRevisionValueChange: (revisionId: string, revision?: RevisionRecord) => void;
  itemLabel: React.ReactNode;
  revisionLabel: React.ReactNode;
  itemHelp?: string;
  revisionHelp?: string;
  excludedRevisionIds?: Iterable<string>;
  disabled?: boolean;
  loading?: boolean;
  showItemType?: boolean;
  testIdPrefix?: string;
};

function revisionItemId(revision: RevisionRecord): string {
  return String(revision.item_id || revision.item_master_id || '');
}

export const ItemRevisionSelector: React.FC<ItemRevisionSelectorProps> = ({
  revisions,
  itemValue,
  revisionValue,
  onItemValueChange,
  onRevisionValueChange,
  itemLabel,
  revisionLabel,
  itemHelp,
  revisionHelp,
  excludedRevisionIds = [],
  disabled = false,
  loading = false,
  showItemType = false,
  testIdPrefix = 'item-revision',
}) => {
  const { t } = useI18n();
  const localizedText = useLocalizedText();
  const excluded = useMemo(() => new Set(Array.from(excludedRevisionIds, String)), [excludedRevisionIds]);
  const availableRevisions = useMemo(
    () => revisions.filter((revision) => !excluded.has(String(revision.master_id)) && revisionItemId(revision)),
    [excluded, revisions],
  );
  const items = useMemo(() => {
    const byId = new Map<string, RevisionRecord>();
    for (const revision of availableRevisions) {
      const itemId = revisionItemId(revision);
      if (!byId.has(itemId)) byId.set(itemId, revision);
    }
    return [...byId.entries()].map(([itemId, revision]) => {
      const name = localizedText(revision.item_name) || localizedText(revision.name) || revision.item_code || t('common.notAvailable');
      const code = String(revision.item_code || revision.code || '');
      const itemType = String(revision.item_type || '');
      const itemTypeKey = `item.type.${itemType}`;
      const translatedItemType = itemType ? t(itemTypeKey) : '';
      const itemTypeLabel = translatedItemType && translatedItemType !== itemTypeKey ? translatedItemType : itemType;
      return { itemId, name, code, itemType, itemTypeLabel };
    });
  }, [availableRevisions, localizedText, t]);
  const selectedItemRevisions = useMemo(
    () => availableRevisions.filter((revision) => revisionItemId(revision) === itemValue),
    [availableRevisions, itemValue],
  );

  const selectItem = (itemId: string) => {
    onItemValueChange(itemId);
    const itemRevisions = availableRevisions.filter((revision) => revisionItemId(revision) === itemId);
    if (itemRevisions.length === 1) {
      const onlyRevision = itemRevisions[0];
      onRevisionValueChange(String(onlyRevision.master_id), onlyRevision);
      return;
    }
    const selectedStillBelongsToItem = itemRevisions.some((revision) => String(revision.master_id) === revisionValue);
    if (!selectedStillBelongsToItem) onRevisionValueChange('');
  };

  const itemLabelNode = <span className="flex items-center gap-1">{itemLabel} *{itemHelp ? <FieldHelpPopover label={String(itemLabel)} title={String(itemLabel)} content={itemHelp} /> : null}</span>;
  const revisionLabelNode = <span className="flex items-center gap-1">{revisionLabel} *{revisionHelp ? <FieldHelpPopover label={String(revisionLabel)} title={String(revisionLabel)} content={revisionHelp} /> : null}</span>;
  const onlyRevision = selectedItemRevisions.length === 1 ? selectedItemRevisions[0] : undefined;

  return <div className="contents">
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-foreground">{itemLabelNode}</span>
      <ComboboxBase
        value={itemValue}
        options={items.map((item) => ({
          value: item.itemId,
          label: showItemType && item.itemTypeLabel ? `${item.name} (${item.itemTypeLabel})` : item.name,
          description: <span className="font-mono text-xs italic">{item.code}</span>,
          searchText: `${item.name} ${item.code} ${item.itemTypeLabel} ${item.itemType}`,
        }))}
        onValueChange={selectItem}
        placeholder={t('itemRevisionSelector.searchItem')}
        emptyMessage={t('itemRevisionSelector.noItems')}
        loading={loading}
        disabled={disabled}
        aria-label={String(itemLabel)}
      />
      <input type="hidden" name={`${testIdPrefix}-item-id`} value={itemValue} data-testid={`${testIdPrefix}-item-value`} />
    </label>
    <div className="block space-y-1">
      <span className="block text-sm font-medium text-foreground">{revisionLabelNode}</span>
      {onlyRevision ? <div data-testid={`${testIdPrefix}-revision-readonly`} className="min-h-11 rounded-md border border-input bg-surface-subtle px-3 py-2 text-sm text-foreground">
        <span className="font-mono font-semibold">{onlyRevision.revision_code || onlyRevision.code}</span>
        <span className="ml-2 text-xs text-muted-foreground">{t('itemRevisionSelector.autoSelected')}</span>
      </div> : <SelectBase
        data-testid={`${testIdPrefix}-revision-select`}
        required
        disabled={disabled || loading || !itemValue}
        value={revisionValue}
        onValueChange={(revisionId) => onRevisionValueChange(revisionId, selectedItemRevisions.find((revision) => String(revision.master_id) === revisionId))}
        options={selectedItemRevisions.map((revision) => ({
          value: String(revision.master_id),
          label: String(revision.revision_code || revision.code || t('common.notAvailable')),
          secondaryLabel: revision.item_code,
        }))}
        placeholder={itemValue ? t('itemRevisionSelector.selectRevision') : t('itemRevisionSelector.selectItemFirst')}
        aria-label={String(revisionLabel)}
      />}
      <input type="hidden" name={`${testIdPrefix}-revision-id`} value={revisionValue} data-testid={`${testIdPrefix}-revision-value`} />
    </div>
  </div>;
};
