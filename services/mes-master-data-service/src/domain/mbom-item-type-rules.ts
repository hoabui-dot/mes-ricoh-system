export type MesItemType = 'FG' | 'SFG' | 'RM';

const ALLOWED_MBOM_INPUT_TYPES: Record<MesItemType, readonly MesItemType[]> = {
  FG: ['SFG', 'RM'],
  SFG: ['RM'],
  RM: [],
};

export function allowedMbomInputTypes(outputType: unknown): readonly MesItemType[] {
  return ALLOWED_MBOM_INPUT_TYPES[String(outputType) as MesItemType] || [];
}

export function isMbomInputTypeAllowed(outputType: unknown, inputType: unknown): boolean {
  return allowedMbomInputTypes(outputType).includes(String(inputType) as MesItemType);
}
