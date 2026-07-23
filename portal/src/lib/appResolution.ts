import type { AppDefinition } from '../config/apps.ts';

export type PortalAppDecision =
  | { kind: 'none'; apps: AppDefinition[] }
  | { kind: 'redirect'; apps: AppDefinition[]; app: AppDefinition }
  | { kind: 'chooser'; apps: AppDefinition[] };

export function getVisibleApps(roles: string[], apps: AppDefinition[]): AppDefinition[] {
  return apps.filter((app) =>
    app.allowedRoles.some((role) => roles.includes(role)),
  );
}

export function resolvePortalApps(apps: AppDefinition[]): PortalAppDecision {
  if (apps.length === 0) {
    return { kind: 'none', apps };
  }

  if (apps.length === 1 && apps[0]?.status === 'live') {
    return { kind: 'redirect', apps, app: apps[0] };
  }

  return { kind: 'chooser', apps };
}
