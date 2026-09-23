import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import "./ColdStartSplash.css";

let coldStartSplashConsumed = false;

const WREATH_PATH = "M 465.0 140.0 C 451.3 141.3 480.8 121.2 426.0 154.0 C 371.2 186.8 186.7 303.3 136.0 337.0 C 85.3 370.7 125.8 342.5 122.0 356.0 C 118.2 369.5 115.3 356.8 113.0 418.0 C 110.7 479.2 106.3 668.8 108.0 723.0 C 109.7 777.2 78.3 714.0 123.0 743.0 C 167.7 772.0 329.7 872.2 376.0 897.0 C 422.3 921.8 389.5 888.0 401.0 892.0 C 412.5 896.0 429.8 915.8 445.0 921.0 C 460.2 926.2 478.2 926.2 492.0 923.0 C 505.8 919.8 516.8 905.5 528.0 902.0 C 539.2 898.5 536.5 912.8 559.0 902.0 C 581.5 891.2 643.3 852.2 663.0 837.0 C 682.7 821.8 669.7 818.0 677.0 811.0 C 684.3 804.0 697.7 797.3 707.0 795.0 C 716.3 792.7 714.8 805.0 733.0 797.0 C 751.2 789.0 799.5 758.8 816.0 747.0 C 832.5 735.2 829.3 789.7 832.0 726.0 C 834.7 662.3 835.7 429.3 832.0 365.0 C 828.3 300.7 858.3 371.7 810.0 340.0 C 761.7 308.3 592.3 207.3 542.0 175.0 C 491.7 142.7 520.8 151.8 508.0 146.0 C 495.2 140.2 478.7 138.7 465.0 140.0 Z";

interface ColdStartSplashProps {
  children: ReactNode;
}

export function ColdStartSplash({ children }: ColdStartSplashProps) {
  const [location] = useLocation();
  const legalPage = location === "/terms" || location === "/privacy";
  const [visible, setVisible] = useState(() => !legalPage && !coldStartSplashConsumed);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const appContentRef = useRef<HTMLDivElement>(null);
  const skipButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (legalPage) {
      coldStartSplashConsumed = true;
      setVisible(false);
      return;
    }
    if (!visible) return;
    coldStartSplashConsumed = true;
    const finish = () => setVisible(false);
    const timer = window.setTimeout(finish, reducedMotion ? 700 : 6000);
    window.addEventListener("pointerdown", finish, { once: true });
    window.addEventListener("keydown", finish, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", finish);
      window.removeEventListener("keydown", finish);
    };
  }, [legalPage, reducedMotion, visible]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(query.matches);
    query.addEventListener("change", updatePreference);
    return () => query.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const appContent = appContentRef.current;
    if (!appContent) return;
    if (visible) {
      appContent.setAttribute("inert", "");
      skipButtonRef.current?.focus({ preventScroll: true });
    } else {
      appContent.removeAttribute("inert");
    }
    return () => appContent.removeAttribute("inert");
  }, [visible]);

  return (
    <>
      <div
        ref={appContentRef}
        className="cgp-cold-splash__app-content"
        aria-hidden={visible ? true : undefined}
      >
        {children}
      </div>
      {visible && (
        <button
          ref={skipButtonRef}
          type="button"
          className="cgp-cold-splash"
          aria-label="Skip Chain Gang Poker introduction"
          onClick={() => setVisible(false)}
        >
          <div className="cgp-cold-splash__scene" aria-hidden="true">
            <div className="cgp-cold-splash__art" />
            <svg className="cgp-cold-splash__path" viewBox="0 0 941 1672" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="cgp-comet-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="22%" stopColor="#FFF9E8" />
                  <stop offset="58%" stopColor="#FFD666" />
                  <stop offset="100%" stopColor="#D4931D" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="cgp-cold-splash__wreath" d={WREATH_PATH} pathLength="1000" />
              <path className="cgp-cold-splash__comet" d={WREATH_PATH} pathLength="1000" />
              <circle
                className="cgp-cold-splash__dot"
                cx={reducedMotion ? 465 : 0}
                cy={reducedMotion ? 140 : 0}
                r="7"
              >
                {!reducedMotion && (
                  <animateMotion dur="1.48s" begin=".65s" repeatCount="indefinite" path={WREATH_PATH} />
                )}
              </circle>
            </svg>
            <div className="cgp-cold-splash__reflection">
              <div className="cgp-cold-splash__art" />
              <svg className="cgp-cold-splash__path cgp-cold-splash__reflection-path" viewBox="0 0 941 1672" preserveAspectRatio="xMidYMid meet">
                <path className="cgp-cold-splash__wreath" d={WREATH_PATH} pathLength="1000" />
                <path className="cgp-cold-splash__comet" d={WREATH_PATH} pathLength="1000" />
                <circle
                  className="cgp-cold-splash__dot"
                  cx={reducedMotion ? 465 : 0}
                  cy={reducedMotion ? 140 : 0}
                  r="7"
                >
                  {!reducedMotion && (
                    <animateMotion dur="1.48s" begin=".65s" repeatCount="indefinite" path={WREATH_PATH} />
                  )}
                </circle>
              </svg>
            </div>
            <div className="cgp-cold-splash__wordmark-sweep" />
            <div className="cgp-cold-splash__suits">
              <span className="cgp-cold-splash__suit cgp-cold-splash__suit--gold">♠</span>
              <span className="cgp-cold-splash__suit cgp-cold-splash__suit--red">♥</span>
              <span className="cgp-cold-splash__suit cgp-cold-splash__suit--gold">♣</span>
              <span className="cgp-cold-splash__suit cgp-cold-splash__suit--red">♦</span>
            </div>
            <div className="cgp-cold-splash__hint">Tap to enter</div>
          </div>
        </button>
      )}
    </>
  );
}