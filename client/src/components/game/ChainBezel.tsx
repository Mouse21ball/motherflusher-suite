import { useId } from 'react';

const POINTS = [[20, 3], [80, 3], [97, 20], [97, 80], [80, 97], [20, 97], [3, 80], [3, 20]];

export function ChainBezel() {
  const id = `yard-chain-${useId().replace(/:/g, '')}`;
  return <svg className="yard-chain-bezel-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#E5E7EB" /><stop offset=".45" stopColor="#6B7280" />
      <stop offset=".7" stopColor="#FDE68A" /><stop offset="1" stopColor="#B45309" />
    </linearGradient></defs>
    <polygon points={POINTS.map(point => point.join(',')).join(' ')} fill="none" stroke="#150A2E" strokeWidth="4" />
    {POINTS.map(([x, y], edge) => {
      const [endX, endY] = POINTS[(edge + 1) % POINTS.length];
      const length = Math.hypot(endX - x, endY - y);
      const angle = Math.atan2(endY - y, endX - x) * 180 / Math.PI;
      const count = Math.ceil(length / 5);
      return <g key={edge} transform={`translate(${x},${y}) rotate(${angle})`}>
        {Array.from({ length: count }, (_, index) => <ellipse key={index}
          cx={index * length / count} cy={0} rx={3.5} ry={1.5}
          transform={`rotate(${index % 2 ? 12 : -12} ${index * length / count} 0)`}
          fill="none" stroke={`url(#${id})`} strokeWidth=".8" />)}
      </g>;
    })}
  </svg>;
}
