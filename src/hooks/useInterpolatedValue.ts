/**
 * Returns the target value immediately — no animation.
 * Previously animated from old → new value, which caused a "rushing" counter
 * effect when switching locations. Now values snap instantly to the real reading.
 */
export function useInterpolatedValue(
  targetValue: number | null,
  _intervalMs = 4800,
): number | null {
  return targetValue;
}
