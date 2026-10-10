import { Crown } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * YOUR HAND glass panel — hero cards in a premium framed section.
 * Detroit 2026-10-10: from ChatGPT mockup, on yard background.
 */
export function YourHandPanel({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="your-hand-panel">
      <div className="your-hand-header">
        <Crown size={16} fill="currentColor" className="your-hand-crown" />
        <span>YOUR HAND</span>
      </div>
      <div className="your-hand-cards">{children}</div>
      {hint && <div className="your-hand-hint">{hint}</div>}
    </div>
  );
}
