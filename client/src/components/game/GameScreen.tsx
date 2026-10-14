/**
 * GameScreen — universal responsive mobile game layout (Detroit 2026-10-14).
 *
 * Five flexible zones that adapt to any portrait viewport:
 *   ZONE A — Header (logo/title, game mode, menu)
 *   ZONE B — Opponents (avatars, names, chips, card backs)
 *   ZONE C — Game Center (pot, community cards, status) — flex-1, centers content
 *   ZONE D — Hero (avatar, name, chips, cards)
 *   ZONE E — Actions (buttons, above safe-area)
 *
 * Zones are logical, not fixed-height. They expand/contract based on
 * device, game mode, and game state. No hardcoded pixel dimensions.
 */
import type { ReactNode } from 'react';
import { useViewport } from '@/hooks/useViewport';

export interface GameScreenProps {
  /** Zone A: header content */
  header?: ReactNode;
  /** Zone B: opponent area content */
  opponents?: ReactNode;
  /** Zone C: game center content (pot, community cards) */
  center?: ReactNode;
  /** Zone D: hero area content (player info, cards) */
  hero?: ReactNode;
  /** Zone E: action buttons */
  actions?: ReactNode;
  /** Background element (rendered behind all zones) */
  background?: ReactNode;
  /** Additional className for the root */
  className?: string;
}

export function GameScreen({
  header,
  opponents,
  center,
  hero,
  actions,
  background,
  className = '',
}: GameScreenProps) {
  const viewport = useViewport();

  return (
    <div
      className={`relative flex flex-col w-full overflow-hidden ${className}`}
      style={{
        // Fill the actual viewport height (dynamic viewport for mobile browsers)
        height: '100dvh',
        // Respect safe-area insets
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
      data-viewport-width={viewport.width}
      data-viewport-height={viewport.height}
    >
      {/* Background — independent of UI zones */}
      {background && (
        <div className="absolute inset-0 -z-10 overflow-hidden">
          {background}
        </div>
      )}

      {/* ZONE A — Header: flex-none, natural height */}
      {header && (
        <header className="flex-none relative z-10">
          {header}
        </header>
      )}

      {/* ZONE B — Opponents: flex-none, natural height */}
      {opponents && (
        <div className="flex-none relative z-10">
          {opponents}
        </div>
      )}

      {/* ZONE C — Game Center: flex-1, centers content in remaining space */}
      {center && (
        <main className="flex-1 relative z-10 flex items-center justify-center min-h-0">
          {center}
        </main>
      )}

      {/* ZONE D — Hero: flex-none, natural height */}
      {hero && (
        <div className="flex-none relative z-10">
          {hero}
        </div>
      )}

      {/* ZONE E — Actions: flex-none, above safe-area, min 44px touch targets */}
      {actions && (
        <footer
          className="flex-none relative z-10"
          style={{
            // Extra padding for devices with home indicators
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
          }}
        >
          {actions}
        </footer>
      )}
    </div>
  );
}

/**
 * ResponsiveCard — a card that sizes based on available width.
 * Maintains 1.4 aspect ratio. Use with useCardSize for dimensions.
 */
export interface ResponsiveCardProps {
  width: number;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function ResponsiveCard({ width, children, className = '', onClick }: ResponsiveCardProps) {
  const height = width * 1.4;
  return (
    <div
      className={`${className}`}
      style={{ width: `${width}px`, height: `${height}px` }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
