export function calcSubIndex(param: string, val: number): number {
  const v = Math.round(val);
  const BP: Record<string, [number, number, number, number][]> = {
    'PM2.5': [[0, 30, 0, 50], [31, 60, 51, 100], [61, 90, 101, 200], [91, 120, 201, 300], [121, 250, 301, 400], [251, 500, 401, 500]],
    PM10:    [[0, 50, 0, 50], [51, 100, 51, 100], [101, 250, 101, 200], [251, 350, 201, 300], [351, 430, 301, 400], [431, 600, 401, 500]],
    SO2:     [[0, 40, 0, 50], [41, 80, 51, 100], [81, 380, 101, 200], [381, 800, 201, 300], [801, 1600, 301, 400], [1601, 2000, 401, 500]],
    NO2:     [[0, 40, 0, 50], [41, 80, 51, 100], [81, 180, 101, 200], [181, 280, 201, 300], [281, 400, 301, 400], [401, 600, 401, 500]],
  };
  const ranges = BP[param];
  if (!ranges) return 0;
  for (const [cLo, cHi, iLo, iHi] of ranges) {
    if (v >= cLo && v <= cHi) {
      return Math.round(((iHi - iLo) / (cHi - cLo)) * (v - cLo) + iLo);
    }
  }
  return v > 0 ? 500 : 0;
}
