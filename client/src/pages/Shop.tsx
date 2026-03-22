import { useState } from 'react';
import { useLocation } from 'wouter';
import { ensurePlayerIdentity, getAvatarInitials, getAvatarColor } from '@/lib/persistence';
import { getProgression, getLevelInfo, getRankForLevel } from '@/lib/progression';

// ─── Premium Shop ─────────────────────────────────────────────────────────────
// Cosmetics, subscriptions, chip bundles — all play money, no gambling.
// Psychology: status signaling, exclusivity, FOMO with limited offers.

const SUBSCRIPTION_TIERS = [
  {
    id: 'basic',
    name: 'Chip Player',
    price: 'Free',
    period: 'forever',
    color: '#C0C0C0',
    bg: 'rgba(192,192,192,0.06)',
    border: 'rgba(192,192,192,0.15)',
    features: [
      '1,000 starting chips per mode',
      'Standard avatar',
      '5 reaction emotes',
      'Daily 250 chip bonus',
    ],
    cta: 'Current Plan',
    ctaDisabled: true,
  },
  {
    id: 'pro',
    name: 'Gold Pro',
    price: '$4.99',
    period: 'per month',
    color: '#C9A227',
    bg: 'rgba(201,162,39,0.08)',
    border: 'rgba(201,162,39,0.30)',
    badge: 'Most Popular',
    features: [
      '5,000 chips/month bonus',
      'Gold avatar frame',
      '15 exclusive reactions',
      'Daily 1,000 chip bonus',
      'Streak protection (1x/week)',
      'XP boost: +25% per hand',
      'Priority table access',
    ],
    cta: 'Upgrade to Gold',
    ctaDisabled: false,
  },
  {
    id: 'elite',
    name: 'Diamond Elite',
    price: '$9.99',
    period: 'per month',
    color: '#9B59B6',
    bg: 'rgba(155,89,182,0.08)',
    border: 'rgba(155,89,182,0.30)',
    badge: 'Best Value',
    features: [
      '15,000 chips/month bonus',
      'Animated diamond frame',
      'All 30 reactions + exclusives',
      'Daily 2,500 chip bonus',
      'Unlimited streak protection',
      'XP boost: +50% per hand',
      'Exclusive Diamond table skin',
      'Custom nameplate color',
      'Early access to new modes',
    ],
    cta: 'Go Diamond',
    ctaDisabled: false,
  },
];

const CHIP_BUNDLES = [
  { chips: 5000,   price: '$1.99',  label: 'Starter Pack', icon: '🪙' },
  { chips: 15000,  price: '$4.99',  label: 'Popular Pack',  icon: '💰', badge: 'Best Value' },
  { chips: 50000,  price: '$9.99',  label: 'High Roller',   icon: '💎' },
  { chips: 150000, price: '$19.99', label: 'Whale Pack',    icon: '🐳' },
];

const AVATAR_FRAMES = [
  { id: 'bronze_ring',   name: 'Bronze Ring',    price: '$0.99',  color: '#CD7F32', preview: '⭕', locked: false },
  { id: 'gold_flames',   name: 'Gold Flames',    price: '$1.99',  color: '#C9A227', preview: '🔥', locked: false },
  { id: 'diamond_pulse', name: 'Diamond Pulse',  price: '$2.99',  color: '#9B59B6', preview: '💜', locked: false },
  { id: 'master_crown',  name: 'Master Crown',   price: 'Pro+',   color: '#E74C3C', preview: '👑', locked: true  },
  { id: 'neon_glow',     name: 'Neon Glow',      price: '$1.99',  color: '#06B6D4', preview: '✨', locked: false },
  { id: 'stealth_black', name: 'Stealth Black',  price: 'Elite',  color: '#374151', preview: '🌑', locked: true  },
];

export default function Shop() {
  const [, navigate] = useLocation();
  const identity = ensurePlayerIdentity();
  const progression = getProgression();
  const levelInfo = getLevelInfo(progression.xp);
  const rank = getRankForLevel(levelInfo.level);
  const [comingSoon, setComingSoon] = useState<string | null>(null);

  const handlePurchase = (id: string) => {
    setComingSoon(id);
    setTimeout(() => setComingSoon(null), 3000);
  };

  return (
    <div className="min-h-[100dvh] bg-[#070709] flex flex-col">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(240,184,41,0.12) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(155,93,229,0.08) 0%, transparent 70%)' }} />
      </div>
      {/* Header */}
      <header
        className="sticky top-0 z-40 w-full px-4 py-3 flex items-center gap-3 border-b"
        style={{ backgroundColor: 'rgba(7,7,9,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="text-[10px] font-mono text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors"
          data-testid="link-back-home"
        >
          ‹ Lobby
        </button>
        <span className="text-white/10">·</span>
        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">⛓️ CGP Shop & Merch</span>
      </header>

      {/* Coming soon toast */}
      {comingSoon && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-[#141417] border border-[#C9A227]/30 shadow-2xl">
          <p className="text-sm font-semibold text-white/80 font-sans text-center">
            Payments launching soon! 🚀
          </p>
          <p className="text-[10px] text-white/30 font-mono text-center mt-0.5">
            Join the waitlist to get notified first
          </p>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center px-4 py-5 gap-6 max-w-lg mx-auto w-full relative">

        {/* Current plan display */}
        <div
          className="w-full rounded-2xl p-4 border flex items-center gap-4"
          style={{ backgroundColor: rank.bg, borderColor: rank.border }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg font-mono text-white shrink-0"
            style={{ backgroundColor: getAvatarColor(identity.avatarSeed) + '22', border: `1.5px solid ${rank.color}40` }}
          >
            {getAvatarInitials(identity.name)}
          </div>
          <div className="flex-1">
            <div className="font-bold text-white/85 font-sans">{identity.name}</div>
            <div className="text-[10px] font-mono mt-0.5" style={{ color: rank.color }}>
              Level {levelInfo.level} · {rank.name} · Free Plan
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest">XP</div>
            <div className="text-sm font-bold font-mono text-white/70 tabular-nums">
              {progression.xp.toLocaleString()}
            </div>
          </div>
        </div>

        {/* ── Subscription tiers ──────────────────────────────────────────── */}
        <div className="w-full">
          <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest mb-3">Subscription Plans</div>
          <div className="flex flex-col gap-2.5">
            {SUBSCRIPTION_TIERS.map(tier => (
              <div
                key={tier.id}
                className="w-full rounded-2xl border p-4 relative"
                style={{ backgroundColor: tier.bg, borderColor: tier.border }}
                data-testid={`tier-${tier.id}`}
              >
                {tier.badge && (
                  <div
                    className="absolute -top-2.5 right-4 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                    style={{ backgroundColor: tier.color, color: '#0B0B0D' }}
                  >
                    {tier.badge}
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-bold text-white/85 font-sans" style={{ color: tier.color }}>
                      {tier.name}
                    </div>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-xl font-bold font-mono text-white/90">{tier.price}</span>
                      {tier.period !== 'forever' && (
                        <span className="text-[10px] text-white/30 font-mono">/ {tier.period}</span>
                      )}
                    </div>
                  </div>
                </div>
                <ul className="space-y-1.5 mb-3">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-white/50">
                      <span style={{ color: tier.color }} className="shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !tier.ctaDisabled && handlePurchase(tier.id)}
                  disabled={tier.ctaDisabled}
                  className={`w-full h-10 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200 ${
                    tier.ctaDisabled
                      ? 'bg-white/[0.04] text-white/20 cursor-default border border-white/[0.06]'
                      : 'text-[#0B0B0D] hover:opacity-90 active:scale-[0.98]'
                  }`}
                  style={!tier.ctaDisabled ? { backgroundColor: tier.color } : undefined}
                  data-testid={`button-subscribe-${tier.id}`}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Chip bundles ──────────────────────────────────────────────── */}
        <div className="w-full">
          <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest mb-3">
            Chip Bundles <span className="text-white/15 normal-case">(play money only)</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CHIP_BUNDLES.map(bundle => (
              <button
                key={bundle.chips}
                onClick={() => handlePurchase(`chips_${bundle.chips}`)}
                className="rounded-2xl bg-[#141417]/80 border border-white/[0.06] hover:border-white/[0.12] p-3.5 text-left transition-all duration-200 active:scale-[0.98] relative group"
                data-testid={`button-bundle-${bundle.chips}`}
              >
                {bundle.badge && (
                  <div className="absolute -top-2 right-2 text-[8px] font-mono font-bold bg-[#C9A227] text-[#0B0B0D] px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                    {bundle.badge}
                  </div>
                )}
                <div className="text-2xl leading-none mb-1.5">{bundle.icon}</div>
                <div className="font-bold font-mono text-white/80 tabular-nums text-sm">
                  ${bundle.chips.toLocaleString()}
                </div>
                <div className="text-[10px] text-white/35 font-sans mt-0.5">{bundle.label}</div>
                <div className="text-[#C9A227] font-bold font-mono text-sm mt-1">{bundle.price}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Avatar frames ─────────────────────────────────────────────── */}
        <div className="w-full">
          <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest mb-3">Avatar Frames</div>
          <div className="grid grid-cols-3 gap-2">
            {AVATAR_FRAMES.map(frame => (
              <button
                key={frame.id}
                onClick={() => !frame.locked && handlePurchase(frame.id)}
                className={`rounded-2xl border p-3 flex flex-col items-center gap-1.5 transition-all duration-200 ${
                  frame.locked
                    ? 'opacity-50 cursor-not-allowed border-white/[0.04] bg-white/[0.01]'
                    : 'hover:border-opacity-50 active:scale-[0.97] bg-[#141417]/80 border-white/[0.06] hover:border-white/[0.14]'
                }`}
                data-testid={`button-frame-${frame.id}`}
              >
                <div className="text-3xl leading-none">{frame.preview}</div>
                <div className="text-[10px] font-sans text-white/55 text-center leading-tight">{frame.name}</div>
                <div
                  className="text-[9px] font-mono font-bold"
                  style={{ color: frame.locked ? 'rgba(255,255,255,0.2)' : frame.color }}
                >
                  {frame.price}
                </div>
                {frame.locked && (
                  <div className="text-[8px] font-mono text-white/20 uppercase tracking-widest">🔒 Locked</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Chain Gang Merch ──────────────────────────────────────────── */}
        <div className="w-full">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest">⛓️ Chain Gang Gear</div>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,107,0,0.2), transparent)' }} />
          </div>
          <div
            className="w-full rounded-2xl p-4 mb-3 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(255,107,0,0.09) 0%, rgba(240,184,41,0.05) 100%)',
              border: '1px solid rgba(255,107,0,0.22)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="text-3xl leading-none anim-float-coin">🧥</div>
              <div>
                <div className="font-bold text-white/80 font-sans">Official CGP Merch</div>
                <div className="text-xs text-white/35 mt-0.5 leading-snug">
                  Rep the gang. Exclusive Chain Gang Poker clothing — hoodies, tees, snapbacks. Limited drops.
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: '🧥', name: 'Chain Gang Hoodie', sub: 'Heavyweight pullover · OG logo', price: '$55', hot: true  },
              { icon: '👕', name: 'CGP OG Tee',         sub: '"Prison rules." — Unisex fit',   price: '$32', hot: false },
              { icon: '🧢', name: 'Snapback Cap',        sub: 'Chain Gang logo · adjustable',  price: '$28', hot: false },
              { icon: '🏀', name: 'Chain Gang Shorts',   sub: 'Court-ready. Mesh pockets.',    price: '$38', hot: true  },
              { icon: '🧦', name: 'Stripe Crew Socks',   sub: 'Triple pack. Chain graphic.',   price: '$18', hot: false },
              { icon: '🦺', name: 'Prison Greens Set',   sub: 'Jogger + hoodie · Limited',     price: '$85', hot: true  },
            ].map(item => (
              <button
                key={item.name}
                onClick={() => handlePurchase(item.name)}
                className="rounded-2xl p-3.5 text-left relative overflow-hidden transition-all duration-200 active:scale-[0.97] group"
                style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,107,0,0.28)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)')}
                data-testid={`button-merch-${item.name.replace(/\s+/g, '-').toLowerCase()}`}
              >
                {item.hot && (
                  <div className="absolute top-2 right-2 text-[8px] font-mono font-bold bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
                    HOT
                  </div>
                )}
                <div className="text-2xl leading-none mb-2">{item.icon}</div>
                <div className="text-sm font-bold text-white/75 font-sans leading-tight">{item.name}</div>
                <div className="text-[10px] text-white/25 font-mono mt-0.5 leading-tight">{item.sub}</div>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-sm font-bold font-mono" style={{ color: '#FF6B00' }}>{item.price}</div>
                  <div className="text-[9px] font-mono text-white/20 uppercase tracking-widest">Soon ›</div>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-xl p-3 flex items-center gap-3"
            style={{ backgroundColor: 'rgba(255,107,0,0.05)', border: '1px solid rgba(255,107,0,0.12)' }}>
            <span className="text-base shrink-0">📦</span>
            <p className="text-[11px] font-mono text-white/25 leading-snug">
              Merch store launching soon. Drop your email to get first access + 20% off your first order.
            </p>
          </div>
        </div>

        <p className="text-[10px] text-white/10 font-mono text-center tracking-wide max-w-xs">
          All chip purchases are play-money only. No real gambling. Chips cannot be withdrawn or redeemed for cash.
        </p>
      </div>
    </div>
  );
}
