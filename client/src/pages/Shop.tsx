import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ensurePlayerIdentity, getAvatarInitials, getAvatarColor } from '@/lib/persistence';
import { getProgression, getLevelInfo, getRankForLevel } from '@/lib/progression';
import { useServerProfile } from '@/lib/useServerProfile';
import { billing, type ActiveSubscription } from '@/lib/billing';

const STRIPES_PACKS = [
  {
    id:       'stripes_starter_99',
    name:     'Starter Pack',
    stripes:  60,
    price:    '$0.99',
    badge:    null as string | null,
    featured: false,
  },
  {
    id:       'stripes_small_499',
    name:     'Small Pack',
    stripes:  300,
    price:    '$4.99',
    badge:    null as string | null,
    featured: false,
  },
  {
    id:       'stripes_medium_999',
    name:     'Medium Pack',
    stripes:  650,
    price:    '$9.99',
    badge:    'BEST STARTER',
    featured: false,
  },
  {
    id:       'stripes_large_2199',
    name:     'Large Pack',
    stripes:  1500,
    price:    '$21.99',
    badge:    'BEST VALUE',
    featured: true,
  },
  {
    id:       'stripes_mega_9999',
    name:     'Mega Pack',
    stripes:  8000,
    price:    '$99.99',
    badge:    'WHALE PACK',
    featured: false,
  },
] as const;

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
    originalPrice: null,
    hot: true,
    href: "mailto:Dgm.entertainment2026@gmail.com?subject=Chain%20Gang%20Snapback%20Order&body=I%27d%20like%20to%20order%20the%20Chain%20Gang%20Snapback%20(%2425).%0A%0ASize%3A%20%0AShipping%20address%3A%20",
  },
  {
    icon: '🃏',
    name: 'CHAIN GANG PLAYING CARDS',
    sub: 'Full custom deck — chain gang artwork',
    price: '$18',
    originalPrice: null,
    hot: false,
    href: "mailto:Dgm.entertainment2026@gmail.com?subject=Playing%20Cards%20Order&body=I%27d%20like%20to%20order%20Chain%20Gang%20Playing%20Cards%20(%2418).%0A%0AQuantity%3A%20%0AShipping%20address%3A%20",
  },
];

// ─── Subscription tier definitions ───────────────────────────────────────────

interface TierDef {
  id:           'basic' | 'pro' | 'elite';
  name:         string;
  tier:         null | 'gold_pro' | 'diamond_elite';
  color:        string;
  bg:           string;
  border:       string;
  emblem:       string;
  badge?:       string;
  features:     string[];
  monthlyPrice: string;
  yearlyPrice:  string;
  yearlySavings: string;
  monthlyProductId: string | null;
  yearlyProductId:  string | null;
}

const TIER_DEFS: TierDef[] = [
  {
    id: 'basic', name: 'Chip Player', tier: null,
    color: '#C0C0C0', bg: 'rgba(192,192,192,0.06)', border: 'rgba(192,192,192,0.15)',
    emblem: '/tier-bronze.png',
    features: [
      '1,000 starting chips per mode',
      'Standard avatar',
      '5 reaction emotes',
      'Daily 250 chip bonus',
    ],
    monthlyPrice: 'Free', yearlyPrice: 'Free', yearlySavings: '',
    monthlyProductId: null, yearlyProductId: null,
  },
  {
    id: 'pro', name: 'Gold Pro', tier: 'gold_pro',
    color: '#C9A227', bg: 'rgba(201,162,39,0.08)', border: 'rgba(201,162,39,0.30)',
    emblem: '/tier-gold.png', badge: 'Most Popular',
    features: [
      'Exclusive Gold avatar frame',
      'Daily +1,000 chip bonus',
      'Monthly 100◆ Stripes grant',
      'XP boost: +25% per hand',
      'Priority table queue',
      'GOLD PRO badge at table',
    ],
    monthlyPrice: '$9.99/mo', yearlyPrice: '$99.99/yr',
    yearlySavings: 'Save 17% ($8.33/mo)',
    monthlyProductId: 'sub_gold_pro_monthly',
    yearlyProductId:  'sub_gold_pro_yearly',
  },
  {
    id: 'elite', name: 'Diamond Elite', tier: 'diamond_elite',
    color: '#9B59B6', bg: 'rgba(155,89,182,0.08)', border: 'rgba(155,89,182,0.30)',
    emblem: '/tier-diamond.png', badge: 'BEST VALUE',
    features: [
      'All Gold Pro benefits',
      'Exclusive animated Diamond frame',
      'Daily +2,500 chip bonus',
      'Monthly 300◆ Stripes grant',
      'XP boost: +50% per hand',
      'Exclusive Diamond table skin',
      'DIAMOND ELITE badge at table',
    ],
    monthlyPrice: '$19.99/mo', yearlyPrice: '$199.99/yr',
    yearlySavings: 'Save 17% ($16.67/mo)',
    monthlyProductId: 'sub_diamond_elite_monthly',
    yearlyProductId:  'sub_diamond_elite_yearly',
  },
];

export default function Shop() {
  const [, navigate]       = useLocation();
  const { profile, refetch } = useServerProfile();

  // ── Stripes purchase state ───────────────────────────────────────────────
  const [purchaseBusy, setPurchaseBusy] = useState<string | null>(null);
  const [purchaseMsg,  setPurchaseMsg]  = useState<string | null>(null);

  // ── Subscription state ───────────────────────────────────────────────────
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [subStatus,     setSubStatus]     = useState<ActiveSubscription | null>(null);
  const [subBusy,       setSubBusy]       = useState<string | null>(null);
  const [subMsg,        setSubMsg]        = useState<string | null>(null);

  // Fetch current subscription on mount
  useEffect(() => {
    billing.getActiveSubscription().then(setSubStatus).catch(() => {});
  }, []);

  const identity   = ensurePlayerIdentity();
  const prog       = getProgression();
  const levelInfo  = getLevelInfo(prog.xp);
  const rank       = getRankForLevel(levelInfo.level);
  const initials   = getAvatarInitials(profile?.displayName ?? identity.name);
  const avatarColor = getAvatarColor(identity.id);

  // ── Stripes purchase handler ─────────────────────────────────────────────
  async function handlePurchase(productId: string) {
    setPurchaseBusy(productId);
    setPurchaseMsg(null);
    try {
      const result = await billing.purchase(productId);
      setPurchaseMsg(`✓ ${result.stripesGranted}◆ Stripes added!`);
      refetch();
    } catch (err: any) {
      setPurchaseMsg(err.message ?? 'Purchase failed');
    } finally {
      setPurchaseBusy(null);
    }
  }

  // ── Subscription purchase handler ────────────────────────────────────────
  async function handleSubscribe(tier: TierDef) {
    const productId = billingPeriod === 'monthly'
      ? tier.monthlyProductId
      : tier.yearlyProductId;
    if (!productId) return;

    setSubBusy(tier.id);
    setSubMsg(null);
    try {
      const result = await billing.launchSubscriptionPurchase(productId);
      setSubMsg(`✓ ${tier.name} activated! ${result.stripesGranted}◆ granted.`);
      const updated = await billing.getActiveSubscription();
      setSubStatus(updated);
      refetch();
    } catch (err: any) {
      setSubMsg(err.message ?? 'Subscription failed');
    } finally {
      setSubBusy(null);
    }
  }

  function handleManageSubscription() {
    billing.openSubscriptionManagement();
  }

  // ── Subscription card state helpers ──────────────────────────────────────
  function getCardState(tier: TierDef): 'current' | 'active' | 'grace' | 'hold' | 'upgrade' | 'downgrade' | 'locked' {
    if (tier.tier === null) {
      return !subStatus?.active ? 'current' : 'locked';
    }
    if (!subStatus) return 'locked';
    if (subStatus.tier === tier.tier) {
      if (subStatus.status === 'in_grace_period') return 'grace';
      if (subStatus.status === 'on_hold') return 'hold';
      return 'active';
    }
    if (subStatus.active) {
      const activeIsDiamond = subStatus.tier === 'diamond_elite';
      const thisIsDiamond   = tier.tier === 'diamond_elite';
      return (activeIsDiamond && !thisIsDiamond) ? 'downgrade' : 'upgrade';
    }
    return 'locked';
  }

  function formatExpiry(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div
      className="min-h-screen text-white flex flex-col items-center"
      style={{ background: 'linear-gradient(180deg, #0B0B0D 0%, #111115 100%)' }}
    >
      {/* ── Header ── */}
      <div className="w-full max-w-md px-4 pt-10 pb-4">
        <button
          onClick={() => navigate('/')}
          className="text-white/30 text-sm font-mono mb-6 flex items-center gap-1 hover:text-white/60 transition-colors"
          data-testid="button-back-shop"
        >
          ← BACK
        </button>

        {/* Player profile summary */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-base font-black"
            style={{ background: avatarColor }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white text-sm truncate">
              {profile?.displayName ?? identity.name}
            </div>
            <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
              Lv.{levelInfo.level} · {rank.name}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono text-white/30 uppercase">Balance</div>
            <div className="text-base font-bold font-mono text-white/85">
              {(profile?.stripes ?? 0).toLocaleString()}◆
            </div>
          </div>
        </div>

        <h1
          className="text-2xl font-black uppercase tracking-widest mb-1"
          style={{ color: '#FF6B00' }}
        >
          ⛓️ Shop
        </h1>
        <p className="text-[11px] font-mono text-white/30 mb-6">
          Premium currency · cosmetics · gear
        </p>

        <div className="flex flex-col gap-8">

          {/* ── Stripes packs ──────────────────────────────────────────────── */}
          <div className="w-full">
            <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest mb-3">
              Buy Stripes ◆
            </div>
            {purchaseMsg && (
              <div
                className="text-xs font-mono text-center mb-3 py-2 px-3 rounded-xl"
                style={{
                  background: purchaseMsg.startsWith('✓') ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: purchaseMsg.startsWith('✓') ? '#4ade80' : '#f87171',
                }}
              >
                {purchaseMsg}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {STRIPES_PACKS.map(pack => (
                <div
                  key={pack.id}
                  className={`w-full rounded-2xl border p-3.5 flex items-center justify-between gap-3 relative ${
                    pack.featured
                      ? 'border-[rgba(255,107,0,0.35)] bg-[rgba(255,107,0,0.06)]'
                      : 'border-white/[0.08] bg-white/[0.02]'
                  }`}
                  data-testid={`pack-${pack.id}`}
                >
                  {pack.badge && (
                    <div
                      className="absolute -top-2.5 right-4 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                      style={{ backgroundColor: pack.featured ? '#FF6B00' : '#C9A227', color: '#0B0B0D' }}
                    >
                      {pack.badge}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-bold text-white/85">{pack.name}</div>
                    <div
                      className="text-lg font-black font-mono"
                      style={{ color: '#C9A227' }}
                    >
                      {pack.stripes}◆
                    </div>
                  </div>
                  <button
                    onClick={() => handlePurchase(pack.id)}
                    disabled={!!purchaseBusy}
                    className="h-9 px-5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200 shrink-0"
                    style={{
                      background: purchaseBusy === pack.id ? 'rgba(255,107,0,0.3)' : '#FF6B00',
                      color: '#fff',
                      opacity: purchaseBusy && purchaseBusy !== pack.id ? 0.4 : 1,
                    }}
                    data-testid={`button-buy-${pack.id}`}
                  >
                    {purchaseBusy === pack.id ? '...' : pack.price}
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[9px] font-mono text-white/15 text-center mt-3 leading-relaxed">
              Stripes are virtual currency for cosmetic features only. No real-world value. Purchases processed via Google Play.
            </p>
          </div>

          {/* ── Subscription tiers ──────────────────────────────────────────── */}
          <div className="w-full">
            <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest mb-3">
              Subscription Plans
            </div>

            {/* Billing period toggle (only shown for paid tiers) */}
            <div className="flex gap-0 mb-4 rounded-xl overflow-hidden border border-white/10 w-fit mx-auto">
              {(['monthly', 'yearly'] as const).map(period => (
                <button
                  key={period}
                  onClick={() => setBillingPeriod(period)}
                  className="px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200"
                  style={{
                    background: billingPeriod === period ? 'rgba(255,107,0,0.15)' : 'transparent',
                    color:      billingPeriod === period ? '#FF6B00' : 'rgba(255,255,255,0.3)',
                  }}
                  data-testid={`button-billing-${period}`}
                >
                  {period === 'monthly' ? 'Monthly' : 'Yearly'}
                </button>
              ))}
            </div>

            {subMsg && (
              <div
                className="text-xs font-mono text-center mb-3 py-2 px-3 rounded-xl"
                style={{
                  background: subMsg.startsWith('✓') ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: subMsg.startsWith('✓') ? '#4ade80' : '#f87171',
                }}
              >
                {subMsg}
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {TIER_DEFS.map(tier => {
                const cardState = getCardState(tier);
                const isActive  = cardState === 'active';
                const isGrace   = cardState === 'grace';
                const isHold    = cardState === 'hold';
                const price     = tier.tier === null
                  ? 'Free'
                  : billingPeriod === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice;

                return (
                  <div
                    key={tier.id}
                    className="w-full rounded-2xl border p-4 relative"
                    style={{ backgroundColor: tier.bg, borderColor: tier.border }}
                    data-testid={`tier-${tier.id}`}
                  >
                    {/* BEST VALUE badge */}
                    {tier.badge && !isActive && (
                      <div
                        className="absolute -top-2.5 right-4 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                        style={{ backgroundColor: tier.color, color: '#0B0B0D' }}
                      >
                        {tier.badge}
                      </div>
                    )}

                    {/* ACTIVE badge */}
                    {(isActive || isGrace || isHold) && (
                      <div
                        className="absolute -top-2.5 right-4 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                        style={{
                          backgroundColor: isGrace ? '#f59e0b' : isHold ? '#ef4444' : '#22c55e',
                          color: '#0B0B0D',
                        }}
                      >
                        {isGrace ? 'GRACE PERIOD' : isHold ? 'PAYMENT HOLD' : 'ACTIVE'}
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <img src={tier.emblem} alt={tier.name} className="w-12 h-12 object-contain mb-2" />
                        <div className="font-bold font-sans" style={{ color: tier.color }}>
                          {tier.name}
                        </div>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-xl font-bold font-mono text-white/90">{price}</span>
                        </div>
                        {tier.tier && billingPeriod === 'yearly' && tier.yearlySavings && (
                          <div
                            className="text-[9px] font-mono mt-0.5 font-bold"
                            style={{ color: tier.color }}
                          >
                            {tier.yearlySavings}
                          </div>
                        )}
                      </div>

                      {/* Expiry + manage button for active tier */}
                      {(isActive || isGrace || isHold) && (
                        <div className="text-right shrink-0">
                          {subStatus?.expiresAt && tier.tier !== null && (
                            <div className="text-[9px] font-mono text-white/30 mb-1">
                              {subStatus.autoRenewing ? 'Renews' : 'Expires'}{'\n'}
                              {formatExpiry(subStatus.expiresAt)}
                            </div>
                          )}
                          {tier.tier !== null && (
                            <button
                              onClick={handleManageSubscription}
                              className="text-[10px] font-mono font-bold px-3 py-1.5 rounded-lg border"
                              style={{ borderColor: tier.color, color: tier.color }}
                              data-testid={`button-manage-${tier.id}`}
                            >
                              MANAGE
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Grace period warning */}
                    {isGrace && (
                      <div className="mb-3 py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-400">
                        ⚠ Payment issue — update payment in Play Store within 3 days to keep benefits.
                      </div>
                    )}

                    {/* Account hold warning */}
                    {isHold && (
                      <div className="mb-3 py-2 px-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] font-mono text-red-400">
                        ⛔ Benefits paused — update payment method in Play Store to restore access.
                      </div>
                    )}

                    <ul className="space-y-1.5 mb-3">
                      {tier.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-white/50">
                          <span style={{ color: tier.color }} className="shrink-0">✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>

                    {/* CTA button */}
                    {tier.tier === null ? (
                      <button
                        disabled
                        className="w-full h-10 rounded-xl text-sm font-bold uppercase tracking-wider bg-white/[0.04] text-white/20 cursor-default border border-white/[0.06]"
                        data-testid={`button-subscribe-${tier.id}`}
                      >
                        {'Current Plan'}
                      </button>
                    ) : isActive ? (
                      <button
                        onClick={handleManageSubscription}
                        className="w-full h-10 rounded-xl text-sm font-bold uppercase tracking-wider border transition-all duration-200"
                        style={{ borderColor: tier.color, color: tier.color, background: 'transparent' }}
                        data-testid={`button-subscribe-${tier.id}`}
                      >
                        Manage Subscription
                      </button>
                    ) : isGrace || isHold ? (
                      <button
                        onClick={handleManageSubscription}
                        className="w-full h-10 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200"
                        style={{ background: isGrace ? '#f59e0b' : '#ef4444', color: '#fff' }}
                        data-testid={`button-subscribe-${tier.id}`}
                      >
                        {isGrace ? 'Fix Payment' : 'Update Payment'}
                      </button>
                    ) : cardState === 'upgrade' || cardState === 'downgrade' ? (
                      <button
                        onClick={() => handleSubscribe(tier)}
                        disabled={!!subBusy}
                        className="w-full h-10 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200"
                        style={{
                          background: subBusy === tier.id ? 'rgba(155,89,182,0.3)' : tier.color,
                          color: '#fff',
                          opacity: subBusy && subBusy !== tier.id ? 0.4 : 1,
                        }}
                        data-testid={`button-subscribe-${tier.id}`}
                      >
                        {subBusy === tier.id ? '...' : cardState === 'upgrade' ? 'Upgrade' : 'Downgrade'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSubscribe(tier)}
                        disabled={!!subBusy}
                        className="w-full h-10 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200"
                        style={{
                          background: subBusy === tier.id
                            ? `rgba(${tier.id === 'pro' ? '201,162,39' : '155,89,182'},0.3)`
                            : tier.color,
                          color: '#0B0B0D',
                          opacity: subBusy && subBusy !== tier.id ? 0.4 : 1,
                        }}
                        data-testid={`button-subscribe-${tier.id}`}
                      >
                        {subBusy === tier.id
                          ? '...'
                          : `Subscribe — ${billingPeriod === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-[9px] font-mono text-white/15 text-center mt-3 leading-relaxed">
              Subscriptions auto-renew. Cancel anytime via Google Play. Virtual chips and Stripes have no real-world value.
            </p>
          </div>

          {/* ── Avatar frames placeholder ─────────────────────────────────── */}
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
            <div className="flex flex-col gap-2.5">
              {MERCH_ITEMS.map((item, i) => (
                <a
                  key={i}
                  href={item.href}
                  className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 flex items-center justify-between gap-3 hover:border-white/20 transition-colors"
                  data-testid={`merch-item-${i}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{item.icon}</div>
                    <div>
                      <div className="text-sm font-bold text-white/85 flex items-center gap-2">
                        {item.name}
                        {item.hot && (
                          <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 uppercase">
                            HOT
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-white/30 mt-0.5">{item.sub}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold font-mono text-white/85">{item.price}</div>
                    {item.originalPrice && (
                      <div className="text-[10px] font-mono text-white/25 line-through">{item.originalPrice}</div>
                    )}
                  </div>
                </a>
              ))}
            </div>
            <p className="text-[9px] font-mono text-white/15 text-center mt-3">
              Order via email. Ships worldwide.
            </p>
          </div>

        </div>

        <div className="h-24" />
      </div>
    </div>
  );
}
