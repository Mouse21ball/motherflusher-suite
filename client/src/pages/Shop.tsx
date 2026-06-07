import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ensurePlayerIdentity, getAvatarInitials, getAvatarColor } from '@/lib/persistence';
import { getProgression, getLevelInfo, getRankForLevel } from '@/lib/progression';
import { useServerProfile } from '@/lib/useServerProfile';
import { billing, type ActiveSubscription } from '@/lib/billing';

// ── Chip image lookup ─────────────────────────────────────────────────────────
const PACK_CHIP: Record<string, string> = {
  stripes_starter_99:  '/chip-starter.png',
  stripes_small_499:   '/chip-popular.png',
  stripes_medium_999:  '/chip-popular.png',
  stripes_large_2499:  '/chip-highroller.png',
  stripes_mega_9999:   '/chip-whale.png',
};

// ── Stripes pack definitions ──────────────────────────────────────────────────
const STRIPES_PACKS = [
  { id: 'stripes_starter_99',  name: 'Starter Pack',  stripes: 100,   price: '$0.99',  badge: null as string | null,  featured: false },
  { id: 'stripes_small_499',   name: 'Small Pack',    stripes: 550,   price: '$4.99',  badge: null as string | null,  featured: false },
  { id: 'stripes_medium_999',  name: 'Medium Pack',   stripes: 1200,  price: '$9.99',  badge: 'BEST STARTER',         featured: false },
  { id: 'stripes_large_2499',  name: 'Large Pack',    stripes: 3250,  price: '$24.99', badge: 'BEST VALUE',           featured: true  },
  { id: 'stripes_mega_9999',   name: 'Mega Pack',     stripes: 15000, price: '$99.99', badge: 'WHALE PACK',           featured: false },
];

// ── Merch ─────────────────────────────────────────────────────────────────────
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

// ── Subscription tier definitions ─────────────────────────────────────────────
interface TierDef {
  id:                'basic' | 'pro' | 'elite';
  name:              string;
  tier:              null | 'gold_pro' | 'diamond_elite';
  color:             string;
  bg:                string;
  border:            string;
  emblem:            string;
  badge?:            string;
  features:          string[];
  monthlyPrice:      string;
  yearlyPrice:       string;
  yearlySavings:     string;
  monthlyProductId:  string | null;
  yearlyProductId:   string | null;
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
    emblem: '/cosmetics/badges/badge-gold-pro.png', badge: 'MOST POPULAR',
    features: [
      'Exclusive Gold avatar frame',
      '2x daily chip reward',
      'Monthly 1,000◆ Stripes grant',
      'XP boost: +50% per hand',
      'Gold Pro badge at table',
    ],
    monthlyPrice: '$4.99', yearlyPrice: '$29.99',
    yearlySavings: '~$2.50/mo · save ~50%',
    monthlyProductId: 'sub_gold_pro_monthly',
    yearlyProductId:  'sub_gold_pro_yearly',
  },
  {
    id: 'elite', name: 'Diamond Elite', tier: 'diamond_elite',
    color: '#9D7DC8', bg: 'rgba(155,89,182,0.08)', border: 'rgba(155,89,182,0.30)',
    emblem: '/cosmetics/badges/badge-diamond-elite.png', badge: 'BEST VALUE',
    features: [
      'All Gold Pro benefits',
      'Exclusive animated Diamond frame',
      '3x daily chip reward',
      'Monthly 2,500◆ Stripes grant',
      'XP boost: +100% per hand',
      'Exclusive Diamond table skin',
      'DIAMOND ELITE badge at table',
    ],
    monthlyPrice: '$9.99', yearlyPrice: '$59.99',
    yearlySavings: '~$5.00/mo · save ~50%',
    monthlyProductId: 'sub_diamond_elite_monthly',
    yearlyProductId:  'sub_diamond_elite_yearly',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionHeader({ children }: { children: string }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      <span style={{ color: '#FFD700', fontSize: 10 }}>◆</span>
      <span
        style={{
          color: '#FFD700',
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '0.18em',
          fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
        }}
      >
        {children}
      </span>
      <span style={{ color: '#FFD700', fontSize: 10 }}>◆</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Shop() {
  const [, navigate]       = useLocation();
  const { profile, refetch } = useServerProfile();

  const [purchaseBusy, setPurchaseBusy] = useState<string | null>(null);
  const [purchaseMsg,  setPurchaseMsg]  = useState<string | null>(null);

  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [subStatus,     setSubStatus]     = useState<ActiveSubscription | null>(null);
  const [subBusy,       setSubBusy]       = useState<string | null>(null);
  const [subMsg,        setSubMsg]        = useState<string | null>(null);

  useEffect(() => {
    billing.getActiveSubscription().then(setSubStatus).catch(() => {});
  }, []);

  const identity    = ensurePlayerIdentity();
  const prog        = getProgression();
  const levelInfo   = getLevelInfo(prog.xp);
  const rank        = getRankForLevel(levelInfo.level);
  const initials    = getAvatarInitials(profile?.displayName ?? identity.name);
  const avatarColor = getAvatarColor(identity.id);

  // ── Handlers (preserved verbatim) ──────────────────────────────────────────
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

  // ── Derived values for hero button ─────────────────────────────────────────
  const eliteTier       = TIER_DEFS[2];
  const eliteCardState  = getCardState(eliteTier);
  const eliteIsActive   = eliteCardState === 'active';
  const elitePrice      = billingPeriod === 'monthly' ? `${eliteTier.monthlyPrice}/MO` : `${eliteTier.yearlyPrice}/YR`;

  // ── CTA button renderer for tier cards ─────────────────────────────────────
  function TierCTA({ tier }: { tier: TierDef }) {
    const cardState = getCardState(tier);
    const isActive  = cardState === 'active';
    const isGrace   = cardState === 'grace';
    const isHold    = cardState === 'hold';

    const baseStyle: React.CSSProperties = {
      borderRadius: 10,
      fontWeight: 800,
      fontSize: 11,
      letterSpacing: '0.06em',
      padding: '10px 14px',
      cursor: 'pointer',
      width: '100%',
      minHeight: 44,
      transition: 'box-shadow 0.15s, transform 0.1s',
      lineHeight: 1.2,
    };

    if (tier.tier === null) {
      return (
        <button
          disabled
          style={{ ...baseStyle, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'default' }}
          data-testid={`button-subscribe-${tier.id}`}
        >
          CURRENT<br />PLAN
        </button>
      );
    }
    if (isActive) {
      return (
        <button
          onClick={handleManageSubscription}
          style={{ ...baseStyle, background: 'transparent', border: `1px solid ${tier.color}`, color: tier.color }}
          data-testid={`button-subscribe-${tier.id}`}
        >
          MANAGE
        </button>
      );
    }
    if (isGrace || isHold) {
      return (
        <button
          onClick={handleManageSubscription}
          style={{ ...baseStyle, background: isGrace ? '#f59e0b' : '#ef4444', color: '#fff', border: 'none' }}
          data-testid={`button-subscribe-${tier.id}`}
        >
          {isGrace ? 'FIX\nPAYMENT' : 'UPDATE\nPAYMENT'}
        </button>
      );
    }
    if (tier.id === 'pro') {
      return (
        <button
          onClick={() => handleSubscribe(tier)}
          disabled={!!subBusy}
          style={{
            ...baseStyle,
            background: subBusy === tier.id
              ? 'rgba(201,162,39,0.35)'
              : 'linear-gradient(135deg, #FFD700 0%, #DAA520 100%)',
            color: '#0B0B0D',
            border: 'none',
            boxShadow: subBusy === tier.id ? 'none' : '0 0 16px rgba(255,215,0,0.5)',
            opacity: subBusy && subBusy !== tier.id ? 0.4 : 1,
          }}
          data-testid={`button-subscribe-${tier.id}`}
        >
          {subBusy === tier.id ? '...' : cardState === 'downgrade' ? 'DOWNGRADE' : 'UPGRADE'}
        </button>
      );
    }
    return (
      <button
        onClick={() => handleSubscribe(tier)}
        disabled={!!subBusy}
        style={{
          ...baseStyle,
          background: subBusy === tier.id
            ? 'rgba(155,89,182,0.35)'
            : 'linear-gradient(135deg, #B57BE8 0%, #6B3FA0 100%)',
          color: '#fff',
          border: 'none',
          boxShadow: subBusy === tier.id ? 'none' : '0 0 16px rgba(181,123,232,0.5)',
          opacity: subBusy && subBusy !== tier.id ? 0.4 : 1,
        }}
        data-testid={`button-subscribe-${tier.id}`}
      >
        {subBusy === tier.id ? '...' : cardState === 'upgrade' ? 'UPGRADE' : 'SUBSCRIBE'}
      </button>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen text-white"
      style={{
        backgroundImage: "url('/cosmetics/backgrounds/shop-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        position: 'relative',
      }}
    >
      {/* Dark overlay */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.50)', zIndex: 0, pointerEvents: 'none' }} />

      {/* Content */}
      <div className="min-h-screen flex flex-col" style={{ position: 'relative', zIndex: 1 }}>
        <div className="w-full max-w-md mx-auto px-4 pt-10 pb-4">

          {/* ── Back button ──────────────────────────────────────────────── */}
          <button
            onClick={() => navigate('/')}
            className="text-white/30 text-sm font-mono mb-6 flex items-center gap-1 hover:text-white/60 transition-colors"
            data-testid="button-back-shop"
          >
            ← BACK
          </button>

          {/* ── Player profile bar ───────────────────────────────────────── */}
          <div
            className="flex items-center gap-3 mb-6 px-4 py-3 rounded-2xl"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-base font-black shrink-0"
              style={{ background: avatarColor }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm truncate">
                {profile?.displayName ?? identity.name}
              </div>
              <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                Lv.{levelInfo.level} · {rank.name}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] font-mono text-white/40 uppercase">Balance</div>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <img src="/stripes-icon.png" alt="" aria-hidden="true" style={{ width: 14, height: 14 }} />
                <span className="text-base font-bold font-mono tabular-nums" style={{ color: '#a855f7' }}>
                  {(profile?.stripes ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* ── Stripes explainer ──────────────────────────────────────── */}
          <p style={{ textAlign: 'center', fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.50)', margin: '0 0 20px' }}>
            Stripes are your premium currency — spend them on cosmetics, Crews, and exclusive features.
          </p>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* HERO — Diamond Elite pitch                                     */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div
            className="mb-6 p-6 rounded-[20px]"
            style={{ background: 'rgba(15,10,25,0.40)' }}
          >
            {/* Title */}
            <h2
              style={{
                fontSize: 48,
                fontWeight: 900,
                letterSpacing: '0.08em',
                lineHeight: 1,
                marginBottom: 8,
                background: 'linear-gradient(180deg, #E8E8F0 0%, #9D7DC8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
              }}
            >
              DIAMOND ELITE
            </h2>

            {/* Price */}
            <div className="flex items-baseline gap-1.5 mb-4">
              <span style={{ fontSize: 28, fontWeight: 900, color: '#9D7DC8' }}>
                {billingPeriod === 'monthly' ? eliteTier.monthlyPrice : eliteTier.yearlyPrice}
              </span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.70)', fontWeight: 600 }}>
                {billingPeriod === 'monthly' ? '/MO' : '/YR'}
              </span>
              {billingPeriod === 'yearly' && (
                <span style={{ fontSize: 11, color: '#9D7DC8', fontFamily: 'monospace', marginLeft: 4 }}>~$16.67/mo</span>
              )}
            </div>

            {/* Benefits */}
            <ul className="space-y-1.5 mb-5">
              {eliteTier.features.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  <span style={{ color: '#9D7DC8', fontSize: 9, flexShrink: 0 }}>◆</span>
                  {f}
                </li>
              ))}
            </ul>

            {/* Subscribe CTA */}
            <button
              onClick={() => eliteIsActive ? handleManageSubscription() : handleSubscribe(eliteTier)}
              disabled={!!subBusy}
              className="w-full transition-all duration-200 active:scale-[0.98]"
              style={{
                background: subBusy === 'elite' ? 'rgba(181,123,232,0.35)' : 'linear-gradient(135deg, #B57BE8 0%, #6B3FA0 100%)',
                borderRadius: 12,
                padding: '18px 32px',
                fontWeight: 800,
                fontSize: 15,
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: subBusy === 'elite' ? 'none' : '0 0 24px rgba(181,123,232,0.6)',
                letterSpacing: '0.05em',
                fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
              }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.boxShadow = '0 0 32px rgba(181,123,232,0.9)'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(181,123,232,0.6)'; }}
              data-testid="button-subscribe-hero-elite"
            >
              {subBusy === 'elite' ? '…' : eliteIsActive ? `MANAGE SUBSCRIPTION` : `SUBSCRIBE — ${elitePrice}`}
            </button>

            {/* Disclaimer */}
            <p className="text-center mt-3 leading-relaxed" style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontStyle: 'italic' }}>
              Subscriptions auto-renew. Cancel anytime via Google Play. Virtual chips and Stripes have no real-world value.
            </p>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* SUBSCRIPTION PLANS                                             */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className="mb-6">
            <SectionHeader>SUBSCRIPTION PLANS</SectionHeader>

            {/* Monthly / Yearly toggle */}
            <div className="flex mb-4 rounded-full overflow-hidden mx-auto w-fit" style={{ border: '1px solid rgba(255,215,0,0.30)' }}>
              {(['monthly', 'yearly'] as const).map(period => (
                <button
                  key={period}
                  onClick={() => setBillingPeriod(period)}
                  className="transition-all duration-200"
                  style={{
                    padding: '8px 24px',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    background: billingPeriod === period ? '#FFD700' : 'transparent',
                    color:      billingPeriod === period ? '#0B0B0D' : 'rgba(255,255,255,0.50)',
                    border: 'none',
                    cursor: 'pointer',
                    minHeight: 44,
                    fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                  }}
                  data-testid={`button-billing-${period}`}
                >
                  {period === 'monthly' ? 'MONTHLY' : 'YEARLY'}
                </button>
              ))}
            </div>

            {/* Sub status message */}
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

            {/* Tier cards */}
            <div className="flex flex-col gap-3">
              {TIER_DEFS.map(tier => {
                const cardState = getCardState(tier);
                const isActive  = cardState === 'active';
                const isGrace   = cardState === 'grace';
                const isHold    = cardState === 'hold';

                return (
                  <div
                    key={tier.id}
                    className="w-full rounded-2xl p-4 relative"
                    style={{
                      background: 'rgba(15,10,25,0.70)',
                      border: `1px solid ${tier.border}`,
                      borderRadius: 16,
                    }}
                    data-testid={`tier-${tier.id}`}
                  >
                    {/* MOST POPULAR / BEST VALUE tag */}
                    {tier.badge && !isActive && !isGrace && !isHold && (
                      <div
                        className="absolute -top-3 right-4 text-[11px] font-bold px-3 py-1 rounded-full uppercase"
                        style={{
                          background: tier.id === 'pro' ? '#FFD700' : '#9D7DC8',
                          color: tier.id === 'pro' ? '#0B0B0D' : '#fff',
                          letterSpacing: '0.04em',
                          fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                        }}
                      >
                        {tier.badge}
                      </div>
                    )}

                    {/* ACTIVE / GRACE / HOLD tag */}
                    {(isActive || isGrace || isHold) && (
                      <div
                        className="absolute -top-3 right-4 text-[10px] font-bold px-3 py-1 rounded-full uppercase"
                        style={{
                          background: isGrace ? '#f59e0b' : isHold ? '#ef4444' : '#22c55e',
                          color: '#0B0B0D',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {isGrace ? 'GRACE PERIOD' : isHold ? 'PAYMENT HOLD' : 'ACTIVE'}
                      </div>
                    )}

                    {/* Grace period warning */}
                    {isGrace && (
                      <div className="mb-3 py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-400">
                        ⚠ Payment issue — update payment in Play Store within 3 days to keep benefits.
                      </div>
                    )}
                    {isHold && (
                      <div className="mb-3 py-2 px-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] font-mono text-red-400">
                        ⛔ Benefits paused — update payment method in Play Store to restore access.
                      </div>
                    )}

                    {/* 3-column layout: medallion | info | button */}
                    <div className="flex items-center gap-3">

                      {/* LEFT: Medallion */}
                      <div className="shrink-0">
                        {tier.id === 'basic' ? (
                          <div
                            style={{
                              width: 80,
                              height: 80,
                              borderRadius: '50%',
                              background: 'radial-gradient(circle at 40% 35%, #8B5A2B, #4A2C17)',
                              border: '4px solid rgba(139,90,43,0.6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                            }}
                          >
                            <span style={{ color: '#D4AF37', fontWeight: 900, fontSize: 36, fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1 }}>I</span>
                          </div>
                        ) : (
                          <img
                            src={tier.emblem}
                            alt={tier.name}
                            style={{ width: 80, height: 80, objectFit: 'contain' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                      </div>

                      {/* CENTER: Name + price + benefits */}
                      <div className="flex-1 min-w-0">
                        <div style={{ fontWeight: 700, color: tier.color, fontSize: 15, marginBottom: 1 }}>{tier.name}</div>

                        {/* Price display */}
                        {tier.tier === null ? (
                          <div style={{ fontWeight: 900, fontSize: 24, color: '#C0C0C0', lineHeight: 1.1, marginBottom: 4 }}>FREE</div>
                        ) : (
                          <div className="flex items-baseline gap-1 mb-1">
                            <span style={{ fontWeight: 900, fontSize: 22, color: '#fff', fontFamily: 'monospace' }}>
                              {billingPeriod === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice}
                            </span>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
                              {billingPeriod === 'monthly' ? '/MO' : '/YR'}
                            </span>
                          </div>
                        )}
                        {tier.tier && billingPeriod === 'yearly' && tier.yearlySavings && (
                          <div style={{ fontSize: 9, color: tier.color, fontFamily: 'monospace', marginBottom: 4 }}>{tier.yearlySavings}</div>
                        )}

                        {/* Benefits list */}
                        <ul className="space-y-0.5 mt-1">
                          {tier.features.map((f, i) => (
                            <li key={i} className="flex items-start gap-1.5" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)' }}>
                              <span style={{ color: tier.id === 'basic' ? '#C0C0C0' : tier.id === 'pro' ? '#FFD700' : '#9D7DC8', flexShrink: 0, fontSize: 7, marginTop: 3 }}>◆</span>
                              {f}
                            </li>
                          ))}
                        </ul>

                        {/* Expiry line for active */}
                        {(isActive || isGrace || isHold) && subStatus?.expiresAt && tier.tier !== null && (
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', fontFamily: 'monospace', marginTop: 4 }}>
                            {subStatus.autoRenewing ? 'Renews' : 'Expires'} {formatExpiry(subStatus.expiresAt)}
                          </div>
                        )}
                      </div>

                      {/* RIGHT: Action button */}
                      <div className="shrink-0" style={{ width: 90 }}>
                        <TierCTA tier={tier} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-[9px] font-mono text-white/20 text-center mt-3 leading-relaxed">
              Subscriptions auto-renew. Cancel anytime via Google Play. Virtual chips and Stripes have no real-world value.
            </p>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* BUY STRIPES                                                    */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className="mb-6">
            <SectionHeader>BUY STRIPES</SectionHeader>

            {/* Purchase status message */}
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

            {/* Pack rows */}
            <div className="flex flex-col" style={{ gap: 10 }}>
              {STRIPES_PACKS.map(pack => (
                <div
                  key={pack.id}
                  className="relative"
                  data-testid={`pack-${pack.id}`}
                >
                  {/* Pill tag */}
                  {pack.badge && (
                    <div
                      className="absolute z-10 text-[11px] font-bold uppercase"
                      style={{
                        top: -8,
                        right: 14,
                        background: pack.id === 'stripes_large_2499' ? '#FF6B1A' : '#FFD700',
                        color: pack.id === 'stripes_large_2499' ? '#fff' : '#0B0B0D',
                        padding: '4px 10px',
                        borderRadius: 12,
                        letterSpacing: '0.05em',
                        fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                      }}
                    >
                      {pack.badge}
                    </div>
                  )}

                  <div
                    className="flex items-center gap-3"
                    style={{
                      background: 'rgba(15,10,25,0.50)',
                      borderRadius: 14,
                      padding: '14px 18px',
                      border: pack.featured
                        ? '2px solid #FF6B1A'
                        : '1px solid rgba(255,255,255,0.06)',
                      boxShadow: pack.featured
                        ? '0 0 16px rgba(255,107,26,0.4)'
                        : 'none',
                    }}
                  >
                    {/* Chip image */}
                    <div className="shrink-0">
                      <img
                        src={PACK_CHIP[pack.id]}
                        alt={pack.name}
                        style={{ width: 60, height: 60, objectFit: 'contain' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>

                    {/* Name + amount */}
                    <div className="flex-1 min-w-0">
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'rgba(255,255,255,0.90)' }}>{pack.name}</div>
                      <div style={{ fontWeight: 900, fontSize: 18, color: '#C9A227', fontFamily: 'monospace', lineHeight: 1.2 }}>
                        {pack.stripes}◆
                      </div>
                    </div>

                    {/* Price button */}
                    <button
                      onClick={() => handlePurchase(pack.id)}
                      disabled={!!purchaseBusy}
                      className="shrink-0 transition-all duration-150 active:scale-[0.97]"
                      style={{
                        background: purchaseBusy === pack.id
                          ? 'rgba(255,107,26,0.35)'
                          : 'linear-gradient(135deg, #FF8C42 0%, #FF6B1A 100%)',
                        color: '#fff',
                        fontWeight: 800,
                        padding: '12px 20px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        boxShadow: purchaseBusy === pack.id ? 'none' : '0 2px 8px rgba(255,107,26,0.4)',
                        opacity: purchaseBusy && purchaseBusy !== pack.id ? 0.4 : 1,
                        minHeight: 44,
                        minWidth: 72,
                        letterSpacing: '0.02em',
                      }}
                      data-testid={`button-buy-${pack.id}`}
                    >
                      {purchaseBusy === pack.id ? '…' : pack.price}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[9px] font-mono text-white/20 text-center mt-4 leading-relaxed italic">
              Stripes are virtual currency for cosmetic features only. No real-world value. Purchases processed via Google Play.
            </p>
          </div>

          {/* ── Chain Gang Gear (merch) ────────────────────────────────────── */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest">⛓️ Chain Gang Gear</div>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,107,0,0.2), transparent)' }} />
            </div>
            <div className="flex flex-col gap-2.5">
              {MERCH_ITEMS.map((item, i) => (
                <a
                  key={i}
                  href={item.href}
                  className="w-full rounded-2xl p-4 flex items-center justify-between gap-3 hover:border-white/20 transition-colors"
                  style={{ background: 'rgba(15,10,25,0.50)', border: '1px solid rgba(255,255,255,0.07)' }}
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
            <p className="text-[9px] font-mono text-white/20 text-center mt-3">
              Order via email. Ships worldwide.
            </p>
          </div>

          <div className="h-24" />
        </div>
      </div>
    </div>
  );
}
