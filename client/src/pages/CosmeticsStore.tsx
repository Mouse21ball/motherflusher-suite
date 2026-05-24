// ─── CosmeticsStore ───────────────────────────────────────────────────────────
// Catalog of Stripes-denominated cosmetic items. Closes the economy loop:
// earn Stripes (daily bonus) → buy Stripes (Shop) → spend Stripes (here).

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ensurePlayerIdentity } from '@/lib/persistence';
import { useServerProfile } from '@/lib/useServerProfile';
import { apiFetch } from '@/lib/session';
import { apiUrl } from '@/lib/apiConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

type CosmeticCategory = 'avatar' | 'frame' | 'name_color';

interface CatalogItem {
  id:          string;
  category:    CosmeticCategory;
  displayName: string;
  description: string;
  stripesCost: number;
  assetPath:   string;
  colorValue:  string | null;
  active:      boolean;
}

interface InventoryItem extends CatalogItem {
  acquiredAt:          string;
  equippedInInventory: boolean;
}

interface EquippedState {
  avatarId:    string | null;
  frameId:     string | null;
  nameColorId: string | null;
}

// ─── Placeholder previews (shown until real assets are uploaded) ──────────────

const AVATAR_PLACEHOLDERS: Record<string, string> = {
  avatar_skull_mask:    '💀',
  avatar_crown:         '👑',
  avatar_diamond_chain: '💎',
  avatar_gold_tooth:    '🦷',
};

const FRAME_COLORS: Record<string, { border: string; glow: string }> = {
  frame_copper_bezel:    { border: '#b87333', glow: 'rgba(184,115,51,0.5)' },
  frame_silver_bars:     { border: '#C0C0C0', glow: 'rgba(192,192,192,0.5)' },
  frame_gold_chain:      { border: '#FFD700', glow: 'rgba(255,215,0,0.5)' },
  frame_diamond_studded: { border: '#b9f2ff', glow: 'rgba(185,242,255,0.5)' },
  frame_animated_flame:  { border: '#ff4500', glow: 'rgba(255,69,0,0.6)' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ItemPreview({ item, size = 64 }: { item: CatalogItem; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (item.category === 'name_color') {
    const color = item.colorValue ?? '#fff';
    return (
      <div style={{
        width: size, height: size, borderRadius: 12,
        background: 'rgba(0,0,0,0.35)',
        border: `2px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 2,
      }}>
        <span style={{
          color, fontWeight: 900, fontSize: size * 0.22,
          fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
          letterSpacing: '0.06em', textShadow: `0 0 8px ${color}88`,
        }}>
          PLAYER
        </span>
        <div style={{ width: size * 0.55, height: 2, borderRadius: 1, background: color, opacity: 0.7 }} />
      </div>
    );
  }

  if (item.assetPath && !imgFailed) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 12,
        background: 'rgba(0,0,0,0.30)',
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <img
          src={item.assetPath}
          alt={item.displayName}
          onError={() => setImgFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12, display: 'block' }}
        />
      </div>
    );
  }

  if (item.category === 'avatar') {
    const emoji = AVATAR_PLACEHOLDERS[item.id] ?? '?';
    return (
      <div style={{
        width: size, height: size, borderRadius: 12,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.5,
      }}>
        <span>{emoji}</span>
      </div>
    );
  }

  const fc = FRAME_COLORS[item.id] ?? { border: '#888', glow: 'rgba(136,136,136,0.4)' };
  const padding = Math.max(3, Math.floor(size * 0.06));
  return (
    <div style={{
      width: size, height: size, borderRadius: 12,
      border: `${padding}px solid ${fc.border}`,
      boxShadow: `0 0 ${size * 0.2}px ${fc.glow}`,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.28, color: fc.border, fontWeight: 700,
      fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
      letterSpacing: '0.05em',
    }}>
      FRAME
    </div>
  );
}

function StateBadge({ state }: { state: 'buy' | 'owned' | 'equipped' }) {
  if (state === 'equipped') return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
      color: '#4ade80', background: 'rgba(74,222,128,0.15)',
      border: '1px solid rgba(74,222,128,0.35)',
      padding: '1px 5px', borderRadius: 4,
      fontFamily: 'monospace', textTransform: 'uppercase',
    }}>✓ Equipped</span>
  );
  if (state === 'owned') return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
      color: '#60a5fa', background: 'rgba(96,165,250,0.15)',
      border: '1px solid rgba(96,165,250,0.30)',
      padding: '1px 5px', borderRadius: 4,
      fontFamily: 'monospace', textTransform: 'uppercase',
    }}>Owned</span>
  );
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
      color: 'rgba(201,162,39,0.90)', background: 'rgba(201,162,39,0.12)',
      border: '1px solid rgba(201,162,39,0.30)',
      padding: '1px 5px', borderRadius: 4,
      fontFamily: 'monospace', textTransform: 'uppercase',
    }}>Buy</span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS: { id: CosmeticCategory; label: string }[] = [
  { id: 'avatar',     label: 'Avatars' },
  { id: 'frame',      label: 'Frames' },
  { id: 'name_color', label: 'Name Colors' },
];

export default function CosmeticsStore() {
  const [, navigate]   = useLocation();
  const identity       = ensurePlayerIdentity();
  const { profile: serverProfile, refetch: refetchProfile } = useServerProfile();

  const [tab,          setTab]          = useState<CosmeticCategory>('avatar');
  const [catalog,      setCatalog]      = useState<CatalogItem[]>([]);
  const [inventory,    setInventory]    = useState<InventoryItem[]>([]);
  const [equipped,     setEquipped]     = useState<EquippedState>({ avatarId: null, frameId: null, nameColorId: null });
  const [loadingData,  setLoadingData]  = useState(true);
  const [selected,     setSelected]     = useState<CatalogItem | null>(null);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [purchasing,   setPurchasing]   = useState(false);
  const [equipping,    setEquipping]    = useState(false);
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null);

  const stripes = serverProfile?.stripes ?? 0;

  // ── Fetch catalog + inventory ──────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [catRes, invRes] = await Promise.all([
        apiFetch(apiUrl('/api/cosmetics/catalog')),
        apiFetch(apiUrl(`/api/players/${identity.id}/inventory`)),
      ]);
      if (catRes.ok) {
        const data = await catRes.json() as { items: CatalogItem[] };
        setCatalog(data.items ?? []);
      }
      if (invRes.ok) {
        const data = await invRes.json() as { items: InventoryItem[]; equipped: EquippedState };
        setInventory(data.items ?? []);
        setEquipped(data.equipped ?? { avatarId: null, frameId: null, nameColorId: null });
      }
    } catch {
      // silent
    } finally {
      setLoadingData(false);
    }
  }, [identity.id]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // ── Toast helper ───────────────────────────────────────────────────────────
  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Item state helper ──────────────────────────────────────────────────────
  function itemState(item: CatalogItem): 'buy' | 'owned' | 'equipped' {
    const isEquipped =
      (item.category === 'avatar'     && equipped.avatarId    === item.id) ||
      (item.category === 'frame'      && equipped.frameId     === item.id) ||
      (item.category === 'name_color' && equipped.nameColorId === item.id);
    if (isEquipped) return 'equipped';
    if (inventory.some(i => i.id === item.id)) return 'owned';
    return 'buy';
  }

  // ── Purchase ───────────────────────────────────────────────────────────────
  async function handlePurchase() {
    if (!selected) return;
    setPurchasing(true);
    setShowConfirm(false);
    try {
      const res = await apiFetch(apiUrl(`/api/players/${identity.id}/cosmetics/purchase`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cosmetic_item_id: selected.id }),
      });
      if (res.ok) {
        await fetchData();
        refetchProfile();
        showToast(`${selected.displayName} added to your collection!`, true);
      } else if (res.status === 402) {
        showToast("Not enough Stripes — visit the Shop to get more.", false);
      } else if (res.status === 409) {
        showToast("You already own this item.", false);
        await fetchData();
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        showToast(d.error ?? 'Purchase failed.', false);
      }
    } catch {
      showToast('Could not connect to server.', false);
    } finally {
      setPurchasing(false);
    }
  }

  // ── Equip ──────────────────────────────────────────────────────────────────
  async function handleEquip(item: CatalogItem) {
    setEquipping(true);
    try {
      const res = await apiFetch(apiUrl(`/api/players/${identity.id}/cosmetics/equip`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cosmetic_item_id: item.id }),
      });
      if (res.ok) {
        const data = await res.json() as { equipped: EquippedState };
        setEquipped(data.equipped);
        await fetchData();
        setSelected(null);
        showToast(`${item.displayName} equipped!`, true);
      } else {
        showToast('Equip failed.', false);
      }
    } catch {
      showToast('Could not connect to server.', false);
    } finally {
      setEquipping(false);
    }
  }

  // ── Unequip ────────────────────────────────────────────────────────────────
  async function handleUnequip(item: CatalogItem) {
    setEquipping(true);
    try {
      const res = await apiFetch(apiUrl(`/api/players/${identity.id}/cosmetics/unequip`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: item.category }),
      });
      if (res.ok) {
        const newEquipped = { ...equipped };
        if (item.category === 'avatar')     newEquipped.avatarId    = null;
        if (item.category === 'frame')      newEquipped.frameId     = null;
        if (item.category === 'name_color') newEquipped.nameColorId = null;
        setEquipped(newEquipped);
        await fetchData();
        setSelected(null);
        showToast(`${item.displayName} unequipped.`, true);
      } else {
        showToast('Unequip failed.', false);
      }
    } catch {
      showToast('Could not connect to server.', false);
    } finally {
      setEquipping(false);
    }
  }

  const isGuest = !serverProfile?.hasAuth;
  const visibleItems = catalog.filter(i => i.category === tab);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: 'system-ui, sans-serif',
        backgroundImage: "url('/cosmetics/backgrounds/cosmetics-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center 30%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        position: 'relative',
      }}
    >
      {/* ── Dark overlay for readability ──────────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.55)', zIndex: 0, pointerEvents: 'none' }} />

      {/* ── Content sits above overlay ────────────────────────────────────── */}
      <div className="min-h-screen flex flex-col" style={{ position: 'relative', zIndex: 1 }}>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl text-sm font-medium shadow-2xl"
          style={{
            background: toast.ok ? 'rgba(20,40,20,0.97)' : 'rgba(40,10,10,0.97)',
            border: `1px solid ${toast.ok ? 'rgba(74,222,128,0.4)' : 'rgba(220,38,38,0.4)'}`,
            color: toast.ok ? '#4ade80' : '#f87171',
            maxWidth: 320,
          }}
        >
          {toast.msg}
          {!toast.ok && toast.msg.includes('Stripes') && (
            <button
              onClick={() => { setToast(null); navigate('/shop'); }}
              className="ml-2 underline"
              style={{ color: 'rgba(201,162,39,0.9)' }}
            >
              Shop →
            </button>
          )}
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(12,11,8,0.96)', borderBottom: '1px solid rgba(201,162,39,0.15)', backdropFilter: 'blur(12px)' }}
      >
        <button
          onClick={() => navigate('/')}
          data-testid="button-cosmetics-back"
          className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
          style={{ background: 'rgba(0,0,0,0.40)', border: '1px solid rgba(201,162,39,0.20)', color: 'rgba(201,162,39,0.7)', fontSize: '1.1rem' }}
        >
          ‹
        </button>
        <div className="flex-1">
          <span
            style={{
              fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
              fontSize: '0.85rem', letterSpacing: '0.18em',
              color: 'rgba(201,162,39,0.90)', textTransform: 'uppercase',
            }}
          >
            ◆ Cosmetics
          </span>
        </div>
        {/* Stripes balance */}
        <div
          data-testid="text-stripes-balance"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{
            background: 'rgba(201,162,39,0.15)',
            border: '1px solid rgba(255,215,0,0.50)',
            boxShadow: '0 0 12px rgba(255, 215, 0, 0.40)',
          }}
        >
          <span style={{ fontSize: '0.85rem' }}>◆</span>
          <span style={{ color: 'rgba(201,162,39,0.95)', fontSize: '0.85rem', fontWeight: 700, fontFamily: 'monospace' }}>
            {stripes.toLocaleString()}
          </span>
        </div>
      </header>

      {/* ── Guest notice ──────────────────────────────────────────────────── */}
      {isGuest && (
        <div
          className="mx-4 mt-3 px-4 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgba(201,162,39,0.07)', border: '1px solid rgba(201,162,39,0.18)', color: 'rgba(201,162,39,0.70)' }}
        >
          💡 Save your progress — link an account to keep your cosmetics permanently.
        </div>
      )}

      {/* ── Category tabs ─────────────────────────────────────────────────── */}
      <div
        className="flex px-4 pt-4 pb-0 gap-1"
        role="tablist"
      >
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-cosmetics-${t.id}`}
            className="flex-1 py-2 rounded-t-xl text-xs font-mono uppercase tracking-wider transition-all"
            style={{
              background: tab === t.id ? 'rgba(201,162,39,0.18)' : 'rgba(0,0,0,0.40)',
              border: `1px solid ${tab === t.id ? 'rgba(255,215,0,0.45)' : 'rgba(255,255,255,0.10)'}`,
              borderBottom: tab === t.id ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.06)',
              color: tab === t.id ? '#FFD700' : 'rgba(255,255,255,0.50)',
              boxShadow: tab === t.id ? '0 2px 14px rgba(255,215,0,0.22), inset 0 1px 0 rgba(255,215,0,0.08)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Item grid ─────────────────────────────────────────────────────── */}
      <div
        className="flex-1 px-4 pt-3 pb-24"
        style={{ borderTop: '1px solid rgba(201,162,39,0.12)' }}
      >
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-xs font-mono" style={{ color: 'rgba(201,162,39,0.40)' }}>Loading…</span>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>No items found</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
            {visibleItems.map(item => {
              const state = itemState(item);
              const isEquippedItem = state === 'equipped';
              return (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  data-testid={`card-cosmetic-${item.id}`}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl text-left transition-all active:scale-95"
                  style={{
                    background: isEquippedItem ? 'rgba(15,40,20,0.80)' : 'rgba(15,10,25,0.75)',
                    border: isEquippedItem
                      ? '1px solid rgba(74,222,128,0.40)'
                      : '1px solid rgba(255,215,0,0.25)',
                    borderRadius: 16,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    boxShadow: isEquippedItem
                      ? '0 4px 20px rgba(0,0,0,0.60), 0 0 16px rgba(74,222,128,0.12)'
                      : '0 4px 20px rgba(0,0,0,0.60)',
                  }}
                >
                  <div className="relative">
                    <ItemPreview item={item} size={72} />
                    {state === 'owned' || state === 'equipped' ? (
                      <div
                        style={{
                          position: 'absolute', bottom: -4, right: -4,
                          width: 20, height: 20, borderRadius: '50%',
                          background: state === 'equipped' ? '#4ade80' : '#60a5fa',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 900, color: '#000',
                          border: '1.5px solid #0c0b08',
                        }}
                      >
                        ✓
                      </div>
                    ) : null}
                  </div>
                  <div className="w-full">
                    <div
                      className="text-xs font-medium truncate"
                      style={{ color: 'rgba(255,255,255,0.88)' }}
                    >
                      {item.displayName}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span style={{ fontSize: 11, color: 'rgba(201,162,39,0.80)', fontFamily: 'monospace' }}>
                        ◆ {item.stripesCost}
                      </span>
                      <StateBadge state={state} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Item Detail Modal ──────────────────────────────────────────────── */}
      {selected && !showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.78)' }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(15,10,25,0.94)', border: '1px solid rgba(255,215,0,0.30)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', margin: '0 16px 16px' }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span
                style={{
                  fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                  fontSize: '0.75rem', letterSpacing: '0.18em',
                  color: 'rgba(201,162,39,0.80)', textTransform: 'uppercase',
                }}
              >
                {selected.displayName}
              </span>
              <button
                onClick={() => setSelected(null)}
                style={{ color: 'rgba(180,130,40,0.40)', fontSize: '1.2rem', background: 'none', border: 'none', cursor: 'pointer' }}
              >×</button>
            </div>

            {/* Preview */}
            <div className="flex justify-center py-4">
              <ItemPreview item={selected} size={110} />
            </div>

            {/* Description */}
            <p className="px-5 text-xs text-center" style={{ color: 'rgba(255,255,255,0.50)', lineHeight: 1.5 }}>
              {selected.description}
            </p>

            {/* Price row */}
            <div className="flex items-center justify-center gap-2 px-5 py-3">
              <span style={{ color: 'rgba(201,162,39,0.70)', fontSize: '0.75rem', fontFamily: 'monospace' }}>Cost:</span>
              <span style={{ color: 'rgba(201,162,39,0.95)', fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace' }}>
                ◆ {selected.stripesCost}
              </span>
              {itemState(selected) === 'buy' && stripes < selected.stripesCost && (
                <span style={{ fontSize: '0.7rem', color: '#f87171', fontFamily: 'monospace' }}>
                  (need {selected.stripesCost - stripes} more)
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 flex flex-col gap-2">
              {itemState(selected) === 'buy' && (
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={stripes < selected.stripesCost || purchasing}
                  data-testid="button-cosmetic-buy"
                  className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40"
                  style={{
                    background: stripes >= selected.stripesCost
                      ? 'linear-gradient(135deg, #c49028 0%, #8a5c14 100%)'
                      : 'rgba(255,255,255,0.07)',
                    color: stripes >= selected.stripesCost ? '#000' : 'rgba(255,255,255,0.35)',
                    fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                    letterSpacing: '0.12em',
                  }}
                >
                  {stripes >= selected.stripesCost
                    ? `BUY — ◆ ${selected.stripesCost}`
                    : `NOT ENOUGH STRIPES`}
                </button>
              )}
              {itemState(selected) === 'owned' && (
                <button
                  onClick={() => void handleEquip(selected)}
                  disabled={equipping}
                  data-testid="button-cosmetic-equip"
                  className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)',
                    color: '#fff',
                    fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                    letterSpacing: '0.12em',
                  }}
                >
                  {equipping ? 'Equipping…' : 'EQUIP'}
                </button>
              )}
              {itemState(selected) === 'equipped' && (
                <>
                  <div
                    className="w-full py-3 rounded-xl font-bold text-sm text-center"
                    style={{
                      background: 'rgba(74,222,128,0.10)',
                      border: '1px solid rgba(74,222,128,0.30)',
                      color: '#4ade80',
                      fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                      letterSpacing: '0.12em',
                    }}
                  >
                    ✓ EQUIPPED
                  </div>
                  <button
                    onClick={() => void handleUnequip(selected)}
                    disabled={equipping}
                    data-testid="button-cosmetic-unequip"
                    className="w-full py-1.5 text-xs transition-all disabled:opacity-40"
                    style={{ color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {equipping ? 'Removing…' : 'Unequip'}
                  </button>
                </>
              )}
              {itemState(selected) === 'buy' && stripes < selected.stripesCost && (
                <button
                  onClick={() => { setSelected(null); navigate('/shop'); }}
                  className="w-full py-2 text-xs transition-all"
                  style={{ color: 'rgba(201,162,39,0.65)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Visit Shop to get more Stripes →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Purchase Confirmation Dialog ───────────────────────────────────── */}
      {showConfirm && selected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.85)' }}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(15,10,25,0.96)', border: '1px solid rgba(255,215,0,0.35)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
          >
            <div className="px-6 pt-6 pb-2 text-center">
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>◆</div>
              <p
                className="text-sm font-medium"
                style={{ color: 'rgba(255,255,255,0.88)', lineHeight: 1.5 }}
              >
                Spend <strong style={{ color: 'rgba(201,162,39,0.95)' }}>◆ {selected.stripesCost} Stripes</strong> for<br />
                <strong style={{ color: '#fff' }}>{selected.displayName}</strong>?
              </p>
              <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Balance after: ◆ {Math.max(0, stripes - selected.stripesCost).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6 pt-4">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={purchasing}
                data-testid="button-confirm-cancel"
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.60)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handlePurchase()}
                disabled={purchasing}
                data-testid="button-confirm-purchase"
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #c49028 0%, #8a5c14 100%)',
                  color: '#000',
                  fontFamily: 'Impact, "Arial Narrow Bold", Arial, sans-serif',
                  letterSpacing: '0.1em',
                }}
              >
                {purchasing ? '…' : 'CONFIRM'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
