import { describe, expect, it } from 'vitest';
import { RESOURCE_DEFINITIONS } from '../../src/domain/resources.js';

describe('WMS master-data resource definitions', () => {
  it('publishes a create event for every owned WMS master-data resource', () => {
    expect(Object.keys(RESOURCE_DEFINITIONS).sort()).toEqual([
      'bins',
      'item-uom-mappings',
      'locations',
      'warehouses',
      'zones',
    ]);

    for (const definition of Object.values(RESOURCE_DEFINITIONS)) {
      expect(definition.createEventType).toMatch(/^WMS\.MasterData\..+Created\.v1$/);
    }
  });

  it('keeps translatable WMS fields as explicit LocalizedText columns', () => {
    expect(RESOURCE_DEFINITIONS['warehouses']?.localizedColumns).toEqual(['warehouse_name', 'warehouse_description']);
    expect(RESOURCE_DEFINITIONS['zones']?.localizedColumns).toEqual(['zone_name']);
    expect(RESOURCE_DEFINITIONS['locations']?.localizedColumns).toEqual(['location_name']);
    expect(RESOURCE_DEFINITIONS['bins']?.localizedColumns).toEqual(['bin_name']);
    expect(RESOURCE_DEFINITIONS['item-uom-mappings']?.localizedColumns).toEqual([]);
  });

  it('allows storage locations to be tagged as Work Center staging locations', () => {
    expect(RESOURCE_DEFINITIONS['locations']?.allowedCreateColumns).toContain('location_purpose');
    expect(RESOURCE_DEFINITIONS['locations']?.allowedCreateColumns).toContain('staging_for_work_center_ref');
    expect(RESOURCE_DEFINITIONS['locations']?.allowedUpdateColumns).toContain('location_purpose');
    expect(RESOURCE_DEFINITIONS['locations']?.allowedUpdateColumns).toContain('staging_for_work_center_ref');
  });
});
