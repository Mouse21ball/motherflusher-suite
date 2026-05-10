import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ensurePlayerIdentity, getAvatarInitials, getAvatarColor } from '@/lib/persistence';
import { getProgression, getLevelInfo, getRankForLevel } from '@/lib/progression';

// ─── Premium Shop ─────────────────────────────────────────────────────────────
// Virtual chips only — play money, no cash value, no withdrawals.

interface ChipProduct {
  id: string;
  name: string;
  description: string;
  priceId: string;
  unitAmount: number;
  chips: number;
  icon?: string;
  badge?: string;
}

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

// Fallback UI while Stripe products load or if Stripe isn't connected yet
const FALLBACK_BUNDLES = [
  { chips: 5000,   unitAmount: 199,  name: 'Starter Pack', icon: '🪙' },
  { chips: 15000,  unitAmount: 499,  name: 'Popular Pack',  icon: '💰', badge: 'Best Value' },
  { chips: 50000,  unitAmount: 999,  name: 'High Roller',   icon: '💎' },
  { chips: 150000, unitAmount: 1999, name: 'Whale Pack',    icon: '🐳' },
];

const MERCH_ITEMS = [
  {
    icon: '👕',
    name: 'CHAIN GANG TEE',
    sub: 'I PLAY CHAIN GANG POKER — animal crew print',
    price: '$30',
    originalPrice: null as string | null,
    hot: false,
  },
  {
    icon: '🧢',
    name: 'CHAIN GANG SNAPBACK',
    sub: 'Trucker mesh — premium logo patch',
    price: '$25',
    originalPrice: null as string | null,
    hot: false,
  },
  {
    icon: '🎁',
    name: 'TEE + HAT BUNDLE',
    sub: 'Save $10 — limited first drop',
    price: '$45',
    originalPrice: '$55',
    hot: true,
  },
];

const MERCH_URL = 'https://chaingangpoker.com/shop';

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Shop() {
  const [, navigate] = useLocation();
  const identity = ensurePlayerIdentity();
  const progression = getProgression();
  const levelInfo = getLevelInfo(progression.xp);
  const rank = getRankForLevel(levelInfo.level);

  const [products, setProducts] = useState<ChipProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Fetch real Stripe products
  useEffect(() => {
    let alive = true;
    fetch('/api/chips/products')
      .then(r => r.json())
      .then(data => { if (alive) setProducts(data.products ?? []); })
      .catch(() => { if (alive) setProducts([]); })
      .finally(() => { if (alive) setLoadingProducts(false); });
    return () => { alive = false; };
  }, []);

  async function handleChipPurchase(productId: string) {
    if (checkingOut) return;
    setCheckingOut(productId);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, userId: identity.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setToast({ type: 'error', msg: data.error || 'Checkout failed. Try again.' });
        setCheckingOut(null);
      }
    } catch {
      setToast({ type: 'error', msg: 'Network error. Please try again.' });
      setCheckingOut(null);
    }
  }

  // Determine what to render: live Stripe products or fallback static list
  const displayBundles: Array<{
    productId?: string;
    chips: number;
    unitAmount: number;
    name: string;
    icon?: string;
    badge?: string;
    isLive: boolean;
  }> = products.length > 0
    ? products.map(p => ({
        productId: p.id,
        chips: p.chips,
        unitAmount: p.unitAmount,
        name: p.name,
        icon: p.icon,
        badge: p.badge,
        isLive: true,
      }))
    : FALLBACK_BUNDLES.map(b => ({ ...b, isLive: false }));

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

      {/* Toast notifications */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl border transition-all ${
          toast.type === 'success'
            ? 'bg-[#0d1a12] border-[#2dbd6e]/40'
            : toast.type === 'error'
              ? 'bg-[#1a0d0d] border-red-500/30'
              : 'bg-[#141417] border-white/10'
        }`}
          data-testid="toast-shop"
        >
          <p className="text-sm font-semibold text-white/85 font-sans text-center">{toast.msg}</p>
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

        {/* ── Chip Bundles ──────────────────────────────────────────────────── */}
        <div className="w-full">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest">
              Chip Bundles
            </div>
            <span className="text-[9px] font-mono text-white/12 normal-case">(play money only · no cash value)</span>
            {!loadingProducts && products.length > 0 && (
              <span className="ml-auto text-[8px] font-mono text-green-400/60 uppercase tracking-widest">● Live</span>
            )}
          </div>

          {loadingProducts ? (
            <div className="grid grid-cols-2 gap-2">
              {[0,1,2,3].map(i => (
                <div key={i} className="rounded-2xl bg-white/[0.02] border border-white/[0.04] h-28 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {displayBundles.map(bundle => (
                <button
                  key={bundle.productId ?? bundle.chips}
                  onClick={() => {
                    if (bundle.isLive && bundle.productId) {
                      handleChipPurchase(bundle.productId);
                    }
                  }}
                  disabled={checkingOut === bundle.productId || (!bundle.isLive)}
                  className="rounded-2xl bg-[#141417]/80 border border-white/[0.06] hover:border-white/[0.12] p-3.5 text-left transition-all duration-200 active:scale-[0.98] relative group disabled:opacity-60 disabled:cursor-default"
                  data-testid={`button-bundle-${bundle.chips}`}
                >
                  {bundle.badge && (
                    <div className="absolute -top-2 right-2 text-[8px] font-mono font-bold bg-[#C9A227] text-[#0B0B0D] px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                      {bundle.badge}
                    </div>
                  )}
                  <div className="text-2xl leading-none mb-1.5">{bundle.icon ?? '🪙'}</div>
                  <div className="font-bold font-mono text-white/80 tabular-nums text-sm">
                    {bundle.chips.toLocaleString()} chips
                  </div>
                  <div className="text-[10px] text-white/35 font-sans mt-0.5">{bundle.name}</div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="text-[#C9A227] font-bold font-mono text-sm">
                      {formatPrice(bundle.unitAmount)}
                    </div>
                    {checkingOut === bundle.productId ? (
                      <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Loading…</span>
                    ) : bundle.isLive ? (
                      <span className="text-[9px] font-mono text-green-400/50 uppercase tracking-widest">Buy ›</span>
                    ) : (
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#C9A227]/15 text-[#C9A227] border border-[#C9A227]/25">
                        v1.1 LAUNCH
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Test-mode badge */}
          {!loadingProducts && products.length > 0 && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/15"
              data-testid="badge-test-mode">
              <span className="text-amber-400/70 text-[10px]">🧪</span>
              <span className="text-[10px] font-mono text-amber-400/60">
                Test mode — use card <strong className="font-bold">4242 4242 4242 4242</strong>, any future date, any CVC
              </span>
            </div>
          )}
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
                href={MERCH_URL}
                target="_blank"
                rel="noopener noreferrer"
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
                  SHOP NOW →
                </div>
              </a>
            ))}
          </div>
          <p className="text-[10px] text-white/40 font-mono text-center mt-4">
            Physical merch ships from chaingangpoker.com — separate from in-app purchases
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
