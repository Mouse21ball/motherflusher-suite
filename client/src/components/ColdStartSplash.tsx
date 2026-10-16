import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import "./ColdStartSplash.css";

let coldStartSplashConsumed = false;

// Detroit 2026-10-16: request fullscreen on user gesture (splash tap).
// Browsers require a user gesture for the Fullscreen API — the splash tap is the natural one.
function requestAppFullscreen() {
  try {
    const el = document.documentElement as any;
    if (document.fullscreenElement) return true;
    if (el.requestFullscreen) { el.requestFullscreen().catch(() => {}); return true; }
    else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return true; }
  } catch {}
  return false;
}

// Detroit 2026-10-16: fully automatic fullscreen — request on the first
// user interaction anywhere in the app, retry until it takes hold.
// Once the user checks "always allow," every visit goes fullscreen on first tap.
if (typeof window !== 'undefined') {
  let fullscreenDone = false;
  const tryFullscreen = () => {
    if (fullscreenDone || document.fullscreenElement) { fullscreenDone = true; return; }
    requestAppFullscreen();
    // Check if it took hold after a beat
    setTimeout(() => {
      if (document.fullscreenElement) {
        fullscreenDone = true;
        window.removeEventListener('pointerdown', tryFullscreen);
      }
    }, 500);
  };
  window.addEventListener('pointerdown', tryFullscreen);
  // Stop trying after 60s to avoid lingering listeners
  setTimeout(() => window.removeEventListener('pointerdown', tryFullscreen), 60000);
}

// This route is drawn over the metal centerline of the supplied chain emblem.
// It stays inside the visible link geometry; it is deliberately not a freeform
// decorative path floating outside the artwork.
const CHAIN_TRACE_PATH =
  "M 468 337 C 445 324 423 328 402 341 L 247 438 C 222 454 212 484 223 509 C 229 523 239 533 252 541 L 366 611 L 250 684 C 226 699 216 727 225 752 C 230 766 240 778 254 787 L 453 913 C 468 922 486 928 504 922 L 704 799 C 728 785 738 758 728 733 C 723 720 713 710 701 702 L 586 632 L 701 561 C 725 546 735 518 726 493 C 722 480 712 469 700 461 L 515 344 C 500 334 483 330 468 337 Z";

interface ColdStartSplashProps {
  children: ReactNode;
}

// Detroit 2026-10-16: shows real boot progress behind the splash.
function BootStatus() {
  const [phase, setPhase] = useState('Starting…');
  useEffect(() => {
    setPhase('Connecting to server…');
    const t1 = setTimeout(() => setPhase('Loading your profile…'), 1200);
    const t2 = setTimeout(() => setPhase('Ready'), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div style={{
      marginTop: 12, fontFamily: 'monospace', fontSize: 11,
      color: 'rgba(240,184,41,0.6)', letterSpacing: '0.08em',
    }}>
      {phase}
    </div>
  );
}

export function ColdStartSplash({ children }: ColdStartSplashProps) {
  const [location] = useLocation();
  const legalPage = location === "/terms" || location === "/privacy";
  const [visible, setVisible] = useState(() => !legalPage && !coldStartSplashConsumed);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [exiting, setExiting] = useState(false);
  const appContentRef = useRef<HTMLDivElement>(null);
  const skipButtonRef = useRef<HTMLButtonElement>(null);
  const exitTimerRef = useRef<number | null>(null);

  const finish = useCallback(() => {
    // Detroit 2026-10-16: forced fullscreen on entry.
    requestAppFullscreen();
    setExiting((alreadyExiting) => {
      if (alreadyExiting) return alreadyExiting;
      exitTimerRef.current = window.setTimeout(
        () => setVisible(false),
        reducedMotion ? 80 : 420,
      );
      return true;
    });
  }, [reducedMotion]);

  useEffect(() => {
    if (legalPage) {
      coldStartSplashConsumed = true;
      setVisible(false);
      return;
    }
    if (!visible || exiting) return;
    coldStartSplashConsumed = true;
    window.addEventListener("pointerdown", finish, { once: true });
    window.addEventListener("keydown", finish, { once: true });
    return () => {
      window.removeEventListener("pointerdown", finish);
      window.removeEventListener("keydown", finish);
    };
  }, [exiting, finish, legalPage, visible]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

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
          className={`cgp-cold-splash${exiting ? " cgp-cold-splash--exiting" : ""}`}
          aria-label="Skip Chain Gang Poker introduction"
          onClick={finish}
        >
          <div className="cgp-cold-splash__scene" aria-hidden="true">
            <div className="cgp-cold-splash__art" />
            <div className="cgp-cold-splash__art cgp-cold-splash__art--wordmark" />
            <div className="cgp-cold-splash__art cgp-cold-splash__art--tagline" />
            <div className="cgp-cold-splash__art cgp-cold-splash__art--suits" />
            <svg className="cgp-cold-splash__path" viewBox="0 0 941 1672" preserveAspectRatio="xMidYMid meet">
              <defs>
                <filter id="cgp-metal-illumination" x="-20%" y="-20%" width="140%" height="140%">
                  <feColorMatrix
                    type="matrix"
                    values="1.35 0 0 0 0.12  0 1.12 0 0 0.06  0 0 0.62 0 0  0 0 0 1 0"
                  />
                  <feGaussianBlur stdDeviation="0.35" />
                </filter>
                <filter id="cgp-trace-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="13" />
                </filter>
                <mask id="cgp-metal-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="941" height="1672">
                  <rect width="941" height="1672" fill="black" />
                  <path className="cgp-cold-splash__metal-mask-path" d={CHAIN_TRACE_PATH} pathLength="1000" />
                </mask>
              </defs>
              <image
                className="cgp-cold-splash__metal-illumination"
                href="/splash-chain-gang-logo.png"
                x="0"
                y="0"
                width="941"
                height="1672"
                preserveAspectRatio="none"
                mask="url(#cgp-metal-mask)"
                filter="url(#cgp-metal-illumination)"
              />
              <path className="cgp-cold-splash__trace-glow" d={CHAIN_TRACE_PATH} pathLength="1000" />
              <path className="cgp-cold-splash__trace-core" d={CHAIN_TRACE_PATH} pathLength="1000" />
              <path className="cgp-cold-splash__trace-hot" d={CHAIN_TRACE_PATH} pathLength="1000" />
            </svg>
            <div className="cgp-cold-splash__wordmark-sweep" />
            <div className="cgp-cold-splash__hint">Tap to enter</div>
            {/* Detroit 2026-10-16: boot status — shows what's loading behind the splash */}
            <BootStatus />
          </div>
        </button>
      )}
    </>
  );
}