import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import "./ColdStartSplash.css";

let coldStartSplashConsumed = false;

const WREATH_PATH = [
  "M 531 180",
  "C 488 154 444 153 405 177",
  "L 190 306",
  "C 151 330 129 366 126 410",
  "L 112 647",
  "C 109 691 131 727 173 751",
  "L 406 881",
  "C 448 905 494 906 536 883",
  "L 768 759",
  "C 810 736 833 701 833 659",
  "L 832 430",
  "C 832 388 809 351 766 324",
  "L 531 180",
  "Z",
].join(" ");

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
              <path className="cgp-cold-splash__wreath" d={WREATH_PATH} pathLength="1000" />
              <path className="cgp-cold-splash__comet" d={WREATH_PATH} pathLength="1000" />
              <circle
                className="cgp-cold-splash__dot"
                cx={reducedMotion ? 531 : 0}
                cy={reducedMotion ? 180 : 0}
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
                  cx={reducedMotion ? 531 : 0}
                  cy={reducedMotion ? 180 : 0}
                  r="7"
                >
                  {!reducedMotion && (
                    <animateMotion dur="1.48s" begin=".65s" repeatCount="indefinite" path={WREATH_PATH} />
                  )}
                </circle>
              </svg>
            </div>
          </div>
          <div className="cgp-cold-splash__hint">Tap to enter</div>
        </button>
      )}
    </>
  );
}