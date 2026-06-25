import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface ChipBurstProps {
  active: boolean;
  originX?: number;
  originY?: number;
}

export function ChipBurst({ active, originX = 0.5, originY = 0.5 }: ChipBurstProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!active || firedRef.current) return;
    firedRef.current = true;

    const chipColors = ['#C9A227', '#D4B44A', '#E8C96B', '#F0D580', '#A07C10', '#8B6914', '#FFFFFF', '#FFE566'];

    const fire = (particleCount: number, spread: number, angle: number, delay: number) => {
      setTimeout(() => {
        confetti({
          particleCount,
          spread,
          angle,
          origin: { x: originX, y: originY },
          colors: chipColors,
          startVelocity: 45,
          gravity: 1.2,
          scalar: 1.2,
          ticks: 120,
          shapes: ['circle', 'square'],
          drift: 0,
        });
      }, delay);
    };

    fire(35, 70, 100, 0);
    fire(30, 70, 80, 100);
    fire(20, 50, 45, 200);
    fire(20, 50, 135, 200);
    fire(15, 60, 270, 300);
  }, [active, originX, originY]);

  useEffect(() => {
    if (!active) firedRef.current = false;
  }, [active]);

  return null;
}
