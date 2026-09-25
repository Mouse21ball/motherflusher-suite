import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Skull, Sparkles, Flame } from 'lucide-react';
import { sfx } from '@/lib/sounds';
import { useCelebrationMotion } from '@/lib/celebrationPreferences';
import {
  resolveCelebration,
  type CelebrationEvent,
  type CelebrationPreset,
} from './celebrationEvents';
import { subscribeCelebrations } from './celebrationService';
import './celebrations.css';

interface Point { x: number; y: number }
interface ChipPath { key: string; start: Point; end: Point; amount: number }
interface ActiveCelebration {
  id: number;
  event: CelebrationEvent;
  preset: CelebrationPreset;
  paths: ChipPath[];
}

function centerOf(element: Element | null, fallback: Point): Point {
  if (!element) return fallback;
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function seatFor(playerId: string): Element | null {
  const escapedId = CSS.escape(playerId);
  // Full-screen results hide the table. Never aim at a seat behind one.
  if (document.querySelector('[data-celebration-result-seat]')) {
    return document.querySelector(`[data-celebration-result-seat="${escapedId}"]`);
  }
  return document.querySelector(`[data-player-seat="${escapedId}"]`);
}

function measurePaths(event: CelebrationEvent): ChipPath[] {
  const showingResults = !!document.querySelector('[data-celebration-result-seat]');
  const start = centerOf(document.querySelector(
    showingResults ? '[data-celebration-result-pot]' : '[data-pot-anchor]',
  ), {
    x: window.innerWidth / 2, y: window.innerHeight * 0.48,
  });
  return event.targets.flatMap(target => {
    const seat = seatFor(target.playerId);
    if (!seat) return []; // no guessed seat: never fly to the wrong player
    const end = centerOf(seat, start);
    return Array.from({ length: 3 }, (_, i) => ({
      key: `${target.playerId}-${i}`, start, end, amount: target.amount,
    }));
  });
}

function particleStyle(index: number, count: number, intensity: CelebrationPreset['intensity']): CSSProperties {
  const angle = (index / count) * Math.PI * 2;
  const strength = intensity === 'premium' ? 1.3 : intensity === 'big' ? 1.15 : 1;
  const distance = (65 + (index % 3) * 22) * strength;
  return {
    '--x': `${Math.round(Math.cos(angle) * distance)}px`,
    '--y': `${Math.round(Math.sin(angle) * distance)}px`,
    '--delay': `${(index % 4) * 45}ms`,
  } as CSSProperties;
}

function CelebrationVisual({ active, reduced }: { active: ActiveCelebration; reduced: boolean }) {
  const { event, preset, paths } = active;
  const isDead7 = preset.animation === 'dead7-skull';
  const isBig = preset.animation === 'chain-sweep';
  const isRare = preset.animation === 'rare-halo';
  const isStreak = preset.animation === 'streak-flare';
  const primarySeat = seatFor(event.playerId);
  const impact = centerOf(primarySeat, { x: window.innerWidth / 2, y: window.innerHeight * 0.55 });
  const baseParticleCount = preset.particles === 'gold-sparks' ? 10 : 20;
  const particleCount = Math.round(baseParticleCount
    * (preset.intensity === 'premium' ? 1.5 : preset.intensity === 'big' ? 1.25 : 1));

  return (
    <div
      key={active.id}
      className={`cgp-celebration cgp-celebration--${preset.animation}${reduced ? ' cgp-celebration--reduced' : ''}`}
      data-testid="celebration"
      data-celebration={event.type}
      style={{ '--celebration-duration': `${reduced ? 900 : preset.durationMs}ms` } as CSSProperties}
      role="status"
      aria-label={`${preset.text}: ${event.playerName}${event.handName ? `, ${event.handName}` : ''}${event.streakCount ? `, ${event.streakCount} wins in a row` : ''} wins ${event.amount.toLocaleString()} chips`}
    >
      {preset.screenEffect === 'dim-pulse' && <div className="cgp-celebration-vignette" aria-hidden="true" />}
      {preset.screenEffect === 'punch' && <div className="cgp-celebration-punch" aria-hidden="true" />}

      {isBig && (
        <div className="cgp-celebration-chain" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => <span key={i} className="cgp-celebration-link" />)}
        </div>
      )}
      {(isRare || isStreak) && (
        <div className="cgp-celebration-emblem" aria-hidden="true">
          {isRare ? <Sparkles strokeWidth={1.3} /> : <Flame strokeWidth={1.3} />}
        </div>
      )}

      {paths.map((path, i) => (
        <div
          key={path.key}
          className={`cgp-celebration-chip${isBig ? ' cgp-celebration-chip--big' : ''}`}
          data-celebration-chip={path.key}
          style={{
            left: path.start.x, top: path.start.y,
            '--dx': `${path.end.x - path.start.x}px`,
            '--dy': `${path.end.y - path.start.y}px`,
            '--chip-delay': `${i % 3 * 90}ms`,
          } as CSSProperties}
          aria-hidden="true"
        />
      ))}
      {isBig && primarySeat && (
        <div className="cgp-celebration-impact" style={{ left: impact.x, top: impact.y }} aria-hidden="true" />
      )}

      <div className="cgp-celebration-title-group">
        {isDead7 && (
          <div className="cgp-celebration-skull" aria-hidden="true">
            <Skull strokeWidth={1.3} />
            <span>7</span>
          </div>
        )}
        {preset.characterAsset && <img className="cgp-celebration-character" src={preset.characterAsset} alt="" />}
        <div className="cgp-celebration-title">{preset.text}</div>
        <div className="cgp-celebration-subtitle">
          {event.playerName} {event.handName && <span>{event.handName} · </span>}
          {event.streakCount && <span>{event.streakCount} WINS · </span>}
          <span>{event.type === 'NORMAL_WIN' ? 'POT ' : '+'}{event.amount.toLocaleString()} CHIPS</span>
        </div>
        {preset.particles !== 'none' && (
          <div className={`cgp-celebration-particles cgp-celebration-particles--${preset.particles}`} aria-hidden="true">
            {Array.from({ length: particleCount }, (_, i) => (
              <span key={i} className="cgp-celebration-spark" style={particleStyle(i, particleCount, preset.intensity)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One global visual host for all server game modes; never blocks pointer input. */
export function CelebrationHost() {
  const motion = useCelebrationMotion();
  const [active, setActive] = useState<ActiveCelebration | null>(null);
  const nextId = useRef(0);

  useEffect(() => subscribeCelebrations(event => {
    if (!event || motion === 'off') {
      setActive(null);
      return;
    }
    const preset = resolveCelebration(event);
    setActive({ id: ++nextId.current, event, preset, paths: measurePaths(event) });
    if (motion === 'full' && preset.sound !== 'none') sfx[preset.sound]();
  }), [motion]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setActive(current => current?.id === active.id ? null : current),
      motion === 'reduced' ? 900 : active.preset.durationMs);
    const cancel = () => setActive(null);
    window.addEventListener('resize', cancel);
    window.addEventListener('scroll', cancel, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('scroll', cancel, true);
    };
  }, [active, motion]);

  useEffect(() => {
    if (motion === 'off') setActive(null);
  }, [motion]);

  useEffect(() => {
    if (!active || motion !== 'full') return;
    const highlighted = new Set<Element>();
    const updateCards = () => {
      // A delayed showdown overlay may replace table cards during the effect.
      const current = new Set(active.event.targets.flatMap(target =>
        Array.from(seatFor(target.playerId)?.querySelectorAll('[data-celebration-card], .playing-card-front') ?? [])));
      highlighted.forEach(card => {
        if (!current.has(card)) {
          card.classList.remove('cgp-celebrating-card');
          highlighted.delete(card);
        }
      });
      current.forEach(card => {
        card.classList.add('cgp-celebrating-card');
        highlighted.add(card);
      });
    };
    updateCards();
    const observer = new MutationObserver(updateCards);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      highlighted.forEach(card => card.classList.remove('cgp-celebrating-card'));
    };
  }, [active, motion]);

  if (!active || motion === 'off') return null;
  return <CelebrationVisual active={active} reduced={motion === 'reduced'} />;
}