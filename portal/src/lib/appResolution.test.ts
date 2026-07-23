import { describe, expect, it } from 'vitest';
import type { AppDefinition } from '../config/apps.ts';
import { getVisibleApps, resolvePortalApps } from './appResolution.ts';

const makeApp = (
  id: string,
  roles: string[],
  status: AppDefinition['status'] = 'live',
): AppDefinition => ({
  id,
  name: id.toUpperCase(),
  acronym: id.toUpperCase(),
  description: id,
  url: `http://localhost/${id}`,
  color: '#000000',
  colorTo: '#111111',
  icon: id,
  allowedRoles: roles,
  status,
});

describe('portal app resolution', () => {
  it('returns no access when the user has no role-entitled apps', () => {
    const apps = [makeApp('mes', ['OPERATOR'])];
    const visibleApps = getVisibleApps(['UNRELATED_ROLE'], apps);

    expect(visibleApps).toEqual([]);
    expect(resolvePortalApps(visibleApps)).toEqual({ kind: 'none', apps: [] });
  });

  it('redirects when the user has exactly one live role-entitled app', () => {
    const mes = makeApp('mes', ['OPERATOR']);
    const visibleApps = getVisibleApps(['OPERATOR'], [mes, makeApp('wms', ['WAREHOUSE_STAFF'])]);

    expect(resolvePortalApps(visibleApps)).toEqual({
      kind: 'redirect',
      apps: [mes],
      app: mes,
    });
  });

  it('shows the chooser when the user has multiple role-entitled apps, including pending apps', () => {
    const mes = makeApp('mes', ['PLANT_MANAGER']);
    const wms = makeApp('wms', ['PLANT_MANAGER'], 'coming-soon');
    const qms = makeApp('qms', ['PLANT_MANAGER'], 'coming-soon');
    const visibleApps = getVisibleApps(['PLANT_MANAGER'], [mes, wms, qms]);

    expect(resolvePortalApps(visibleApps)).toEqual({
      kind: 'chooser',
      apps: [mes, wms, qms],
    });
  });
});
