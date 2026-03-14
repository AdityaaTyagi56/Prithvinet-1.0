import { useState, useEffect, useRef } from 'react';

/**
 * Smoothly animates a numeric value from its previous state to a new target.
 *
 * Usage:
 *   const displayAQI = useInterpolatedValue(rawAQI)
 *   // displayAQI counts up/down gradually instead of jumping
 *
 * @param targetValue  The real current value from the data source (null = loading)
 * @param intervalMs   How long the animation runs in ms (default = 28s, just under WS tick)
 */
export function useInterpolatedValue(
  targetValue: number | null,
  intervalMs = 28_000,
): number | null {
  const [displayValue, setDisplayValue] = useState<number | null>(targetValue);
  const prevRef = useRef<number | null>(targetValue);
  const animRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (targetValue === null) return;

    const start = prevRef.current ?? targetValue;
    const end = targetValue;
    const startTime = performance.now();

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / intervalMs, 1);
      // Ease-in-out cubic
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setDisplayValue(Math.round((start + (end - start) * eased) * 10) / 10);
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    animRef.current = requestAnimationFrame(animate);
    prevRef.current = targetValue;

    return () => {
      if (animRef.current !== undefined) cancelAnimationFrame(animRef.current);
    };
  }, [targetValue, intervalMs]);

  return displayValue;
}
