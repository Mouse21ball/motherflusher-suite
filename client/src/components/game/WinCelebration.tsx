import { useMemo, useEffect, useRef } from 'react';

interface Particle {
  id: number;
  dx: number;
  dy: number;
  size: number;
  color: string;
  delay: number;
  shape: 'circle' | 'rect' | 'chip';
  rotate: number;
}

const PALETTE = [
  '#C9A227', '#D4B44A', '#F0D060', '#E8C040',
  '#FFD700', '#FFC107',
  'rgba(255,255,255,0.70)',
  'rgba(212,180,74,0.80)',
  '#ff6b6b', '#00C896',
];

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI + (Math.random() * 0.6 - 0.3);
    const dist = 70 + Math.random() * 160;
    const shapes: Particle['shape'][] = ['circle', 'circle', 'rect', 'chip', 'rect'];
    return {
      id: i,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 40,
      size: 5 + Math.floor(Math.random() * 8),
      color: PALETTE[i % PALETTE.length],
      delay: i * 16,
      shape: shapes[i % shapes.length],
      rotate: Math.random() * 360,
    };
  });
}

interface WinCelebrationProps {
  isScoop?: boolean;
  onDone: () => void;
}

export function WinCelebration({ isScoop = false, onDone }: WinCelebrationProps) {
  const particles = useMemo(() => generateParticles(isScoop ? 48 : 32), [isScoop]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), isScoop ? 2000 : 1600);
    return () => clearTimeout(t);
  }, [isScoop]);

  return (
    <div className="absolute inset-0 pointer-events-none z-[60] overflow-hidden flex items-center justify-center">
      {/* Gold flash ring */}
      <div
        className="absolute rounded-full"
        style={{
          width: 24, height: 24,
          border: '3px solid rgba(201,162,39,0.90)',
          animation: 'win-ring-expand 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        }}
      />
      {isScoop && (
        <div
          className="absolute rounded-full"
          style={{
            width: 24, height: 24,
            border: '2px solid rgba(255,255,255,0.55)',
            animation: 'win-ring-expand 800ms 120ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}
        />
      )}

      {/* WIN text flash */}
      <div
        className="absolute z-10 select-none"
        style={{
          fontFamily: "'Oswald', 'Inter', sans-serif",
          fontWeight: 700,
          fontSize: isScoop ? '28px' : '22px',
          color: '#C9A227',
          letterSpacing: '0.2em',
          textShadow: '0 0 24px rgba(201,162,39,0.90), 0 0 48px rgba(201,162,39,0.50)',
          animation: 'win-text-flash 1200ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        }}
      >
        {isScoop ? 'SCOOP!' : 'YOU WIN!'}
      </div>

      {/* Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: p.shape === 'rect' ? p.size * 0.55 : p.size,
            height: p.shape === 'rect' ? p.size * 1.6 : p.size,
            borderRadius: p.shape === 'chip' ? '50%' : p.shape === 'rect' ? '2px' : '50%',
            background: p.shape === 'chip'
              ? `radial-gradient(circle at 40% 35%, ${p.color}, rgba(0,0,0,0.4))`
              : p.color,
            border: p.shape === 'chip' ? `1px solid rgba(0,0,0,0.25)` : 'none',
            ['--dx' as string]: `${p.dx}px`,
            ['--dy' as string]: `${p.dy}px`,
            ['--rot' as string]: `${p.rotate}deg`,
            animation: `particle-burst-v2 ${900 + Math.random() * 400}ms cubic-bezier(0.22, 0.61, 0.36, 1) ${p.delay}ms forwards`,
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  );
}
