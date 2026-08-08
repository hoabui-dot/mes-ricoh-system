import React, { useMemo } from 'react';
import { CheckCircle2, CircleX } from 'lucide-react';
import { useI18n } from '@mom-platform/i18n-ui-shared';
import { isMbomInputTypeAllowed } from '../lib/mbomItemTypeRules';
import { getMbomSubstituteCompatibilityDetails, isRevisionReleasedAndEffective } from '../lib/mbomSubstituteValidation';

type RecordValue = Record<string, any>;

type Props = {
  componentRevision?: RecordValue;
  substituteRevision?: RecordValue;
  outputItemType?: string;
  uoms: RecordValue[];
  conversions: RecordValue[];
  priority: unknown;
  conversionFactor: unknown;
  maxUsagePercent: unknown;
  effectiveFrom: string;
  effectiveTo?: string;
  existingSubstitutes: RecordValue[];
};

export const SubstituteValidationSummary: React.FC<Props> = ({
  componentRevision,
  substituteRevision,
  outputItemType,
  uoms,
  conversions,
  priority,
  conversionFactor,
  maxUsagePercent,
  effectiveFrom,
  effectiveTo,
  existingSubstitutes,
}) => {
  const { t } = useI18n();
  const checks = useMemo(() => {
    if (!substituteRevision) return [];
    const componentUomId = String(componentRevision?.base_uom_id || componentRevision?.uom_id || '');
    const substituteUomId = String(substituteRevision.base_uom_id || substituteRevision.uom_id || '');
    const componentUom = uoms.find((row) => String(row.master_id) === componentUomId);
    const substituteUom = uoms.find((row) => String(row.master_id) === substituteUomId);
    const compatibilityDetails = getMbomSubstituteCompatibilityDetails(componentRevision, substituteRevision, uoms, conversions);
    const numericPriority = Number(priority);
    const validDates = Boolean(effectiveFrom) && !Number.isNaN(Date.parse(effectiveFrom))
      && (!effectiveTo || (!Number.isNaN(Date.parse(effectiveTo)) && Date.parse(effectiveTo) > Date.parse(effectiveFrom)));
    return [
      { key: 'revision', valid: isRevisionReleasedAndEffective(substituteRevision), text: t('mbom.substituteValidation.revision') },
      { key: 'different', valid: String(componentRevision?.master_id || '') !== String(substituteRevision.master_id), text: t('mbom.substituteValidation.differentRevision') },
      { key: 'type', valid: isMbomInputTypeAllowed(outputItemType, substituteRevision.item_type), text: t('mbom.substituteValidation.itemType') },
      { key: 'group', valid: !compatibilityDetails.some((detail) => detail.code === 'MBOM_SUBSTITUTE_ITEM_GROUP_MISMATCH'), text: t('mbom.substituteValidation.itemGroup', { expected: String(componentRevision?.item_group || '-'), actual: String(substituteRevision.item_group || '-') }) },
      { key: 'uom', valid: !compatibilityDetails.some((detail) => detail.code === 'MBOM_SUBSTITUTE_UOM_CONVERSION_MISSING'), text: t('mbom.substituteValidation.uom', { component: String(componentUom?.code || '-'), substitute: String(substituteUom?.code || '-') }) },
      { key: 'priority', valid: Number.isInteger(numericPriority) && numericPriority > 0 && !existingSubstitutes.some((row) => Number(row.priority) === numericPriority), text: t('mbom.substituteValidation.priority') },
      { key: 'factor', valid: Number.isFinite(Number(conversionFactor)) && Number(conversionFactor) > 0, text: t('mbom.substituteValidation.factor') },
      { key: 'usage', valid: Number(maxUsagePercent) > 0 && Number(maxUsagePercent) <= 100, text: t('mbom.substituteValidation.maxUsage') },
      { key: 'dates', valid: validDates, text: t('mbom.substituteValidation.dates') },
    ];
  }, [componentRevision, conversions, conversionFactor, effectiveFrom, effectiveTo, existingSubstitutes, maxUsagePercent, outputItemType, priority, substituteRevision, t, uoms]);

  if (!substituteRevision) return null;
  return <section data-testid="mbom-substitute-validation" className="space-y-2 rounded-md border border-slate-700 bg-slate-950/70 p-3 sm:col-span-2">
    <h3 className="text-sm font-semibold text-slate-100">{t('mbom.substituteValidation.title')}</h3>
    <ul className="grid gap-2 text-xs sm:grid-cols-2">
      {checks.map((check) => <li key={check.key} data-valid={check.valid ? 'true' : 'false'} className={check.valid ? 'flex items-start gap-2 text-emerald-300' : 'flex items-start gap-2 text-rose-300'}>
        {check.valid ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>{check.text}</span>
      </li>)}
    </ul>
  </section>;
};
