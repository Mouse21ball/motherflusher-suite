import { useMemo, useEffect, useRef } from 'react';

interface Particle {
  id: number;
  dx: number;
  dy: number;
  size: number;
  color: string;
  delay: number;
}

const PALETTE = [
  '#C9A227',
  '#D4B44A',
  '#A8871E',
  'rgba(212,180,74,0.55)',
  'rgba(255,255,255,0.45)',
];

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI + (Math.random() * 0.35 - 0.17);
    const dist = 65 + Math.random() * 110;
    return {
      id: i,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      size: 4 + Math.floor(Math.random() * 5),
      color: PALETTE[i % PALETTE.length],
      delay: i * 22,
    };
  });
}

interface WinCelebrationProps {
  isScoop?: boolean;
  onDone: () => void;
}

export function WinCelebration({ isScoop = false, onDone }: WinCelebrationProps) {
  const particles = useMemo(() => generateParticles(isScoop ? 26 : 18), [isScoop]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), 1100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-[60] overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: '45%',
            left: '50%',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: p.color,
            ['--dx' as string]: `${p.dx}px`,
            ['--dy' as string]: `${p.dy}px`,
            animation: `particle-burst 880ms cubic-bezier(0.22, 0.61, 0.36, 1) ${p.delay}ms forwards`,
            willChange: 'transform, opacity',
          }}
        />
      ))}
      {isScoop && (
        <div
          className="absolute rounded-full border-2 border-[#C9A227]"
          style={{
            top: '45%',
            left: '50%',
            width: 32,
            height: 32,
            animation: 'scoop-ring 760ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}
        />
      )}
    </div>
  );
}
