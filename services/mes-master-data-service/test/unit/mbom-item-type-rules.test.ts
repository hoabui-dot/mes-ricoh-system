import { describe, expect, it } from 'vitest';
import { allowedMbomInputTypes, isMbomInputTypeAllowed } from '../../src/domain/mbom-item-type-rules.js';

describe('MBOM input Item Type rules', () => {
  it('allows SFG and RM inputs for an FG output', () => {
    expect(allowedMbomInputTypes('FG')).toEqual(['SFG', 'RM']);
    expect(isMbomInputTypeAllowed('FG', 'SFG')).toBe(true);
    expect(isMbomInputTypeAllowed('FG', 'RM')).toBe(true);
    expect(isMbomInputTypeAllowed('FG', 'FG')).toBe(false);
  });

  it('allows only RM inputs for an SFG output', () => {
    expect(allowedMbomInputTypes('SFG')).toEqual(['RM']);
    expect(isMbomInputTypeAllowed('SFG', 'RM')).toBe(true);
    expect(isMbomInputTypeAllowed('SFG', 'SFG')).toBe(false);
    expect(isMbomInputTypeAllowed('SFG', 'FG')).toBe(false);
  });

  it('does not allow inputs for an invalid MBOM output type', () => {
    expect(isMbomInputTypeAllowed('RM', 'RM')).toBe(false);
    expect(isMbomInputTypeAllowed('UNKNOWN', 'RM')).toBe(false);
  });
});
