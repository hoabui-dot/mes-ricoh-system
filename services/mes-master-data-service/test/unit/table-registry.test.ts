import { describe, expect, it } from 'vitest';
import { TABLES, TABLE_BY_RESOURCE } from '../../src/domain/table-registry.js';

describe('MES master-data table registry', () => {
  it('declares every explicitly listed Phase 1 owned table', () => {
    expect(TABLE_BY_RESOURCE.size).toBe(TABLES.length);
    expect(TABLE_BY_RESOURCE.get('items')?.tableName).toBe('md_item');
    expect(TABLE_BY_RESOURCE.get('employees')?.eventType).toBe('MES.MasterData.EmployeeCreated.v1');
    expect(TABLE_BY_RESOURCE.get('mbom-headers')?.eventType).toBe('MES.MasterData.MBOMReleased.v2');
    expect(TABLE_BY_RESOURCE.get('production-versions')?.eventType).toBe('MES.MasterData.ProductionVersionReleased.v1');
    expect(TABLE_BY_RESOURCE.get('production-areas')?.tableName).toBe('md_production_area');
    expect(TABLE_BY_RESOURCE.get('resource-assignments')?.tableName).toBe('md_resource_assignment');
    expect(TABLE_BY_RESOURCE.has('traceability-policies')).toBe(false);
    expect(TABLE_BY_RESOURCE.has('terminals')).toBe(false);
    expect(TABLE_BY_RESOURCE.has('ebom-headers')).toBe(false);
    expect(TABLE_BY_RESOURCE.has('ebom-lines')).toBe(false);
  });
});
