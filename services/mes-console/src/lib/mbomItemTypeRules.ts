export function allowedMbomInputTypes(outputType: unknown): string[] {
  if (outputType === 'FG') return ['SFG', 'RM'];
  if (outputType === 'SFG') return ['RM'];
  return [];
}

export function filterMbomInputRevisions(revisions: any[], outputType: unknown): any[] {
  const allowed = new Set(allowedMbomInputTypes(outputType));
  return revisions.filter((revision) => allowed.has(String(revision.item_type || '')));
}

export function isMbomInputTypeAllowed(outputType: unknown, inputType: unknown): boolean {
  return allowedMbomInputTypes(outputType).includes(String(inputType || ''));
}
