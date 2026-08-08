type RecordValue = Record<string, any>;

export type MbomSubstituteCompatibilityDetail = {
  code: 'MBOM_SUBSTITUTE_ITEM_GROUP_MISMATCH' | 'MBOM_SUBSTITUTE_UOM_CONVERSION_MISSING';
  component_item_code: string;
  substitute_item_code: string;
  expected_group?: string;
  actual_group?: string;
  component_uom_code?: string;
  substitute_uom_code?: string;
  component_uom_class?: string;
  substitute_uom_class?: string;
};

export function isRevisionReleasedAndEffective(record: RecordValue | undefined): boolean {
  if (!record || String(record.lifecycle_status || record.status) !== 'Released') return false;
  const now = Date.now();
  return (!record.effective_from || Date.parse(record.effective_from) <= now)
    && (!record.effective_to || Date.parse(record.effective_to) > now);
}

export function getMbomSubstituteCompatibilityDetails(
  componentRevision: RecordValue | undefined,
  substituteRevision: RecordValue | undefined,
  uoms: RecordValue[],
  conversions: RecordValue[],
): MbomSubstituteCompatibilityDetail[] {
  if (!componentRevision || !substituteRevision) return [];

  const componentUomId = String(componentRevision.base_uom_id || componentRevision.uom_id || '');
  const substituteUomId = String(substituteRevision.base_uom_id || substituteRevision.uom_id || '');
  const componentUom = uoms.find((row) => String(row.master_id) === componentUomId);
  const substituteUom = uoms.find((row) => String(row.master_id) === substituteUomId);
  const componentCode = String(componentRevision.item_code || componentRevision.code || '-');
  const substituteCode = String(substituteRevision.item_code || substituteRevision.code || '-');
  const details: MbomSubstituteCompatibilityDetail[] = [];

  if (!componentRevision.item_group || componentRevision.item_group !== substituteRevision.item_group) {
    details.push({
      code: 'MBOM_SUBSTITUTE_ITEM_GROUP_MISMATCH',
      component_item_code: componentCode,
      substitute_item_code: substituteCode,
      expected_group: String(componentRevision.item_group || '-'),
      actual_group: String(substituteRevision.item_group || '-'),
    });
  }

  if (componentUomId !== substituteUomId) {
    const now = Date.now();
    const hasConversion = conversions.some((row) => {
      const pairMatches = (String(row.from_uom_id) === componentUomId && String(row.to_uom_id) === substituteUomId)
        || (String(row.from_uom_id) === substituteUomId && String(row.to_uom_id) === componentUomId);
      const active = String(row.lifecycle_status || row.status) === 'Released'
        && (!row.effective_from || Date.parse(row.effective_from) <= now)
        && (!row.effective_to || Date.parse(row.effective_to) > now);
      const validScope = row.item_id
        ? String(row.item_id) === String(substituteRevision.item_id || '')
        : Boolean(componentUom?.uom_class && componentUom.uom_class === substituteUom?.uom_class);
      return pairMatches && active && validScope;
    });
    if (!hasConversion) {
      details.push({
        code: 'MBOM_SUBSTITUTE_UOM_CONVERSION_MISSING',
        component_item_code: componentCode,
        substitute_item_code: substituteCode,
        component_uom_code: String(componentUom?.code || '-'),
        substitute_uom_code: String(substituteUom?.code || '-'),
        component_uom_class: String(componentUom?.uom_class || '-'),
        substitute_uom_class: String(substituteUom?.uom_class || '-'),
      });
    }
  }

  return details;
}
