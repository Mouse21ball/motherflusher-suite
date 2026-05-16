import { useLocation } from 'wouter';
import { ensurePlayerIdentity, getAvatarInitials, getAvatarColor } from '@/lib/persistence';
import { getProgression, getLevelInfo, getRankForLevel } from '@/lib/progression';

const SUBSCRIPTION_TIERS = [
  {
    id: 'basic',
    name: 'Chip Player',
    price: 'Free',
    period: 'forever',
    color: '#C0C0C0',
    bg: 'rgba(192,192,192,0.06)',
    border: 'rgba(192,192,192,0.15)',
    emblem: '/tier-bronze.png',
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
    emblem: '/tier-gold.png',
    features: [
      '5,000 chips/month bonus',
      'Gold avatar frame',
      'Daily 1,000 chip bonus',
      'Streak protection (1x/week)',
      'XP boost: +25% per hand',
      'Priority table access',
    ],
    cta: 'AVAILABLE v1.1',
    ctaDisabled: true,
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
    emblem: '/tier-diamond.png',
    features: [
      '15,000 chips/month bonus',
      'Animated diamond frame',
      'Daily 2,500 chip bonus',
      'Unlimited streak protection',
      'XP boost: +50% per hand',
      'Exclusive Diamond table skin',
      'Custom nameplate color',
      'Early access to new modes',
    ],
    cta: 'AVAILABLE v1.1',
    ctaDisabled: true,
  },
];

const MERCH_ITEMS = [
  {
    icon: '👕',
    name: 'CHAIN GANG TEE',
    sub: 'I PLAY CHAIN GANG POKER — animal crew print',
    price: '$30',
    originalPrice: null as string | null,
    hot: false,
    href: "mailto:Dgm.entertainment2026@gmail.com?subject=Chain%20Gang%20Tee%20Order&body=I%27d%20like%20to%20order%20the%20Chain%20Gang%20Tee%20(%2430).%0A%0ASize%3A%20%0AShipping%20address%3A%20%0AColor%20preference%3A%20",
  },
  {
    icon: '🧢',
    name: 'CHAIN GANG SNAPBACK',
    sub: 'Trucker mesh — premium logo patch',
    price: '$25',
    originalPrice: null as string | null,
    hot: false,
    href: "mailto:Dgm.entertainment2026@gmail.com?subject=Chain%20Gang%20Snapback%20Order&body=I%27d%20like%20to%20order%20the%20Chain%20Gang%20Snapback%20(%2425).%0A%0ASize%3A%20%0AShipping%20address%3A%20%0AColor%20preference%3A%20",
  },
  {
    icon: '🎁',
    name: 'TEE + HAT BUNDLE',
    sub: 'Save $10 — limited first drop',
    price: '$45',
    originalPrice: '$55',
    hot: true,
    href: "mailto:Dgm.entertainment2026@gmail.com?subject=Chain%20Gang%20Tee%20%2B%20Hat%20Bundle%20Order&body=I%27d%20like%20to%20order%20the%20Tee%20%2B%20Hat%20Bundle%20(%2445).%0A%0AT-Shirt%20size%3A%20%0AHat%20color%3A%20%0AShipping%20address%3A%20",
  },
];

export default function Shop() {
  const [, navigate] = useLocation();
  const identity = ensurePlayerIdentity();
  const progression = getProgression();
  const levelInfo = getLevelInfo(progression.xp);
  const rank = getRankForLevel(levelInfo.level);

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
        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">⛓️ CGP Shop</span>
      </header>

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
                    <img src={tier.emblem} alt={tier.name} className="w-12 h-12 object-contain mb-2" />
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
                  disabled={tier.ctaDisabled}
                  className="w-full h-10 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200 bg-white/[0.04] text-white/20 cursor-default border border-white/[0.06]"
                  data-testid={`button-subscribe-${tier.id}`}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Avatar frames ─────────────────────────────────────────────── */}
        <div className="w-full">
          <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest mb-3">Avatar Frames</div>
          <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-6 text-center">
            <div className="text-3xl mb-2">⛓️</div>
            <h3 className="text-base font-bold text-white tracking-wider uppercase">Avatar Frames</h3>
            <p className="text-xs text-white/50 font-mono mt-1">Coming with v1.1 — animated frames, exclusive cosmetics</p>
          </div>
        </div>

        {/* ── Chain Gang Gear (merch) ────────────────────────────────────── */}
        <div className="w-full">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest">⛓️ Chain Gang Gear</div>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,107,0,0.2), transparent)' }} />
          </div>
          <div className="flex flex-col gap-2">
            {MERCH_ITEMS.map(item => (
              <a
                key={item.name}
                href={item.href}
                className="rounded-2xl p-4 text-left relative overflow-hidden transition-all duration-200 active:scale-[0.98] flex items-center gap-4"
                style={{ backgroundColor: '#0D0D14', border: '1px solid rgba(255,255,255,0.05)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,107,0,0.28)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)')}
                data-testid={`link-merch-${item.name.replace(/\s+/g, '-').toLowerCase()}`}
              >
                {item.hot && (
                  <div className="absolute top-3 right-3 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500 text-white font-bold">
                    HOT
                  </div>
                )}
                <div className="text-3xl leading-none shrink-0">{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white/80 font-sans leading-tight">{item.name}</div>
                  <div className="text-[10px] text-white/30 font-mono mt-0.5 leading-tight">{item.sub}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {item.originalPrice && (
                      <span className="text-[11px] font-mono text-white/20 line-through">{item.originalPrice}</span>
                    )}
                    <span className="text-sm font-bold font-mono" style={{ color: '#FF6B00' }}>{item.price}</span>
                  </div>
                </div>
                <div className="shrink-0 text-[11px] font-mono font-bold text-white/40 uppercase tracking-widest whitespace-nowrap">
                  EMAIL TO ORDER →
                </div>
              </a>
            ))}
          </div>
          <p className="text-[10px] text-white/40 font-mono text-center mt-4 leading-relaxed">
            Physical merch fulfilled by DGM Entertainment via email order — separate from in-app purchases.<br />
            Allow 3-5 business days for response and shipping coordination.
          </p>
        </div>

        <p className="text-[11px] text-white/25 font-mono text-center leading-relaxed max-w-xs" data-testid="text-shop-disclaimer">
          Virtual chips are for entertainment only. They have no cash value, cannot be redeemed, and cannot be withdrawn. No real-money gambling.
        </p>
        <div className="flex items-center justify-center gap-3 pb-2">
          <a href="/terms" className="text-[9px] font-mono text-white/15 hover:text-white/35 transition-colors">Terms</a>
          <span className="text-white/10 text-[9px]">·</span>
          <a href="/privacy" className="text-[9px] font-mono text-white/15 hover:text-white/35 transition-colors">Privacy</a>
        </div>
      </div>
    </div>
  );
}
