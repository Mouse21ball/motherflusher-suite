import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Home, Coins, Users, Target, Menu } from 'lucide-react';
import { useServerProfile } from '@/lib/useServerProfile';
import { useYardMissionBadge } from '@/lib/yardMissionBadge';

const ITEMS = [
  { label: 'HOME', href: '/', icon: Home },
  { label: 'MY CHIPS', href: '/shop', icon: Coins },
  { label: 'SOCIAL', href: '/crews', icon: Users },
  { label: 'MISSIONS', href: '/missions', icon: Target },
  { label: 'MORE', href: '/bonus', icon: Menu },
];

export function YardBottomNav({ active = 'HOME', missionDot }: { active?: string; missionDot?: boolean }) {
  const [location, navigate] = useLocation();
  const { profile } = useServerProfile();
  const cachedMissionDot = useYardMissionBadge(profile?.profileId);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { setMoreOpen(false); }, [location]);
  const moreLinks = [
    ['BONUS CENTER', '/bonus'], ['LEADERBOARD', '/leaderboard'], ['PROFILE', '/profile'],
    ['COSMETICS', '/cosmetics'], ['FRIENDS', '/friends'], ['CREWS', '/crews'],
  ] as const;
  return <nav className="yard-bottom-nav" aria-label="Main navigation">
    {ITEMS.map(({ label, href, icon: Icon }) => {
      const selected = label === active || (label === 'HOME' && location === '/');
      return <button key={label} type="button" aria-label={label} aria-current={selected ? 'page' : undefined}
        className={`yard-nav-item${selected ? ' is-active' : ''}`}
        onClick={() => {
          if (label === 'MORE') setMoreOpen(open => !open);
          else navigate(href);
        }}>
        <span className="yard-nav-icon"><Icon size={21} strokeWidth={2.2} />{label === 'MISSIONS' && (missionDot ?? cachedMissionDot) && <i />}</span>
        <span>{label}</span>
      </button>;
    })}
    {moreOpen && <div className="yard-more-menu" role="menu" aria-label="More destinations">
      {moreLinks.map(([label, href]) => <button type="button" key={href} role="menuitem" onClick={() => navigate(href)}>{label}</button>)}
    </div>}
  </nav>;
}
