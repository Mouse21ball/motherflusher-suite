/**
 * useViewport — runtime viewport measurement for responsive mobile game layout.
 * (Detroit 2026-10-14: universal responsive mobile game layout spec)
 *
 * Measures the actual available viewport at runtime — no hardcoded dimensions.
 * Accounts for device pixel ratio, safe-area insets, and dynamic changes
 * (rotation, keyboard, app switching).
 */
import { useState, useEffect, useCallback } from 'react';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ViewportInfo {
  /** CSS viewport width */
  width: number;
  /** CSS viewport height */
  height: number;
  /** Device pixel ratio */
  dpr: number;
  /** Safe-area insets from CSS env() */
  safeArea: SafeAreaInsets;
  /** Usable width (viewport minus safe-area left/right) */
  usableWidth: number;
  /** Usable height (viewport minus safe-area top/bottom) */
  usableHeight: number;
  /** True for narrow phones (< 360px) */
  isNarrow: boolean;
  /** True for very small screens (< 340px) */
  isTiny: boolean;
  /** Aspect ratio (width / height) */
  aspect: number;
}

function readSafeArea(): SafeAreaInsets {
  if (typeof window === 'undefined' || typeof getComputedStyle === 'undefined') {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  const style = getComputedStyle(document.documentElement);
  const parse = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    top: parse(style.getPropertyValue('--sat').trim() || '0'),
    bottom: parse(style.getPropertyValue('--sab').trim() || '0'),
    left: parse(style.getPropertyValue('--sal').trim() || '0'),
    right: parse(style.getPropertyValue('--sar').trim() || '0'),
  };
}

function measure(): ViewportInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const safeArea = readSafeArea();
  const usableWidth = Math.max(0, width - safeArea.left - safeArea.right);
  const usableHeight = Math.max(0, height - safeArea.top - safeArea.bottom);
  return {
    width,
    height,
    dpr,
    safeArea,
    usableWidth,
    usableHeight,
    isNarrow: width < 360,
    isTiny: width < 340,
    aspect: height > 0 ? width / height : 0,
  };
}

export function useViewport(): ViewportInfo {
  const [viewport, setViewport] = useState<ViewportInfo>(() =>
    typeof window !== 'undefined'
      ? measure()
      : {
          width: 393, height: 851, dpr: 1,
          safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
          usableWidth: 393, usableHeight: 851,
          isNarrow: false, isTiny: false, aspect: 393 / 851,
        }
  );

  const update = useCallback(() => {
    setViewport(measure());
  }, []);

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    // Handle keyboard showing/hiding on mobile
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update);
    }
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', update);
      }
    };
  }, [update]);

  return viewport;
}

/**
 * useCardSize — calculate responsive card dimensions based on available width.
 * Maintains 1.4 aspect ratio (standard playing card).
 * Returns dimensions that fit `count` cards with `overlapRatio` in `availableWidth`.
 */
export function useCardSize(
  availableWidth: number,
  count: number,
  maxCardWidth = 120,
  overlapRatio = 0.25
): { width: number; height: number; overlap: number } {
  if (count <= 0 || availableWidth <= 0) {
    return { width: 0, height: 0, overlap: 0 };
  }
  // With overlap, effective width per card is width * (1 - overlapRatio) except the last
  // Total = width + (count - 1) * width * (1 - overlapRatio)
  // Solve for width: width = availableWidth / (1 + (count - 1) * (1 - overlapRatio))
  const effectiveCount = 1 + (count - 1) * (1 - overlapRatio);
  const width = Math.min(maxCardWidth, availableWidth / effectiveCount);
  const height = width * 1.4;
  const overlap = width * overlapRatio;
  return { width, height, overlap };
}
