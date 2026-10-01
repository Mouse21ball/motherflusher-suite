const DRAW_LIMITS: Record<string, number> = {
  DRAW_1: 3,
  DRAW_2: 2,
  DRAW_3: 1,
};

export function getBadugiDrawLimit(phase: string): number {
  return DRAW_LIMITS[phase] ?? 0;
}

export function toggleBadugiDrawSelection(
  selectedIndices: readonly number[],
  index: number,
  drawLimit: number,
): number[] {
  if (selectedIndices.includes(index)) return selectedIndices.filter(selected => selected !== index);
  if (selectedIndices.length < drawLimit) return [...selectedIndices, index];
  return [...selectedIndices];
}