import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AuthModal } from "@/components/AuthModal";
import { apiFetch } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { AvatarWithFrame } from "@/components/ui/AvatarWithFrame";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PublicClub {
  id: string; name: string; clubId: string;
  memberCount: number; chipBank: number; inviteCode: string;
}
interface CrewMember {
  id: string; playerId: string; displayName: string;
  avatarId: string | null; equippedFrameId: string | null;
  role: string; joinedAt: string; totalChipsWon: number; chipBalance?: number;
}
interface CrewDetail {
  id: string; name: string; description: string | null;
  inviteCode: string; captainId: string; memberCount: number;
  chipBank?: number; clubId?: string; isPublic?: boolean;
  createdAt: string; members: CrewMember[];
}
interface ChatMsg {
  id: string; playerId: string; playerName: string;
  avatarId: string | null; role: string; message: string; createdAt: string;
}
interface ChipRequest {
  id: number; playerId: string; playerName?: string;
  amount: number; status: string;
  requestedAt: string; resolvedAt?: string | null;
}
interface LiveTable {
  tableId: string; modeId: string; humanCount: number;
  phase: string; maxPlayers: number; isInviteOnly: boolean; crewId?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function AvatarChip({ name, size = 32, equippedFrameId }: { name: string; size?: number; equippedFrameId?: string | null }) {
  const initials = name.slice(0, 2).toUpperCase();
  const frameSrc = equippedFrameId ? `/cosmetics/frames/${equippedFrameId.replace(/_/g, '-')}.png` : null;
  return <AvatarWithFrame initials={initials} initialsColor="#fff" frameSrc={frameSrc} size={size} />;
}

function roleBadge(role: string) {
  if (role === "owner" || role === "captain") {
    return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(240,184,41,0.22)", color: "#f0b829", border: "1px solid rgba(240,184,41,0.35)" }}>OWNER</span>;
  }
  if (role === "agent") {
    return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(180,180,180,0.15)", color: "#bbb", border: "1px solid rgba(180,180,180,0.3)" }}>AGENT</span>;
  }
  return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>MEMBER</span>;
}

const BG: React.CSSProperties = {
  backgroundImage: "url('/crews/crews-bg.png')",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundAttachment: "fixed",
};
const OVERLAY: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 0 };
const GOLD = "#f0b829";
const GOLD_DIM = "rgba(240,184,41,0.5)";

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CrewsPage() {
  const [, navigate]   = useLocation();
  const { toast }      = useToast();

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await apiFetch("/api/auth/me");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30000,
  });

  const playerId: string = me?.profileId ?? "";

  const [crew, setCrew]       = useState<CrewDetail | null | "loading">("loading");
  const [stripes, setStripes] = useState<number>(0);
  const [tab, setTab]         = useState<"tables" | "members" | "bank" | "chat">("members");

  // modal states
  const [showCreate, setShowCreate]       = useState(false);
  const [showJoin, setShowJoin]           = useState(false);
  const [leaveTarget, setLeaveTarget]     = useState<CrewDetail | null>(null);
  const [kickTarget, setKickTarget]       = useState<CrewMember | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const loadCrew = useCallback(async () => {
    if (!playerId) return;
    const crewRes = await apiFetch(`/api/players/${playerId}/crew`);
    if (crewRes.ok) { const d = await crewRes.json(); setCrew(d.crew ?? null); }
    else setCrew(null);
    const sr = await apiFetch(`/api/players/${playerId}/stripes`);
    if (sr.ok) { const d = await sr.json(); setStripes(d.stripes ?? 0); }
  }, [playerId]);

  useEffect(() => { loadCrew(); }, [loadCrew]);

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else navigate("/");
  }

  // ── Unauthenticated wall ──────────────────────────────────────────────────
  if (!me || !me.profileId) {
    return (
      <>
        <div className="min-h-screen flex flex-col" style={BG}>
          <div style={OVERLAY} />
          <div className="relative z-10 flex items-center px-4 py-4" style={{ borderBottom: "1px solid rgba(240,184,41,0.18)" }}>
            <button onClick={goBack} data-testid="btn-crews-back"
              className="flex items-center justify-center transition-all active:scale-90"
              style={{ width: 40, height: 40, borderRadius: "50%", border: "2px solid rgba(240,184,41,0.6)", background: "rgba(240,184,41,0.08)", color: GOLD, fontSize: 20 }}>
              ‹
            </button>
            <h1 className="flex-1 text-center font-mono font-bold tracking-[0.22em] text-base" style={{ color: GOLD }}>CREWS</h1>
            <div style={{ width: 40 }} />
          </div>
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
            <p className="font-mono text-base" data-testid="crews-guest-message" style={{ color: "rgba(240,184,41,0.85)" }}>
              Sign in to access Crews.
            </p>
            <button onClick={() => setShowAuthModal(true)} data-testid="btn-crews-sign-in"
              className="w-full max-w-xs font-mono font-bold tracking-widest transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg,#FFD700,#DAA520)", color: "#0a0805", padding: "14px 32px", borderRadius: 10, fontSize: 15 }}>
              SIGN IN
            </button>
            <button onClick={() => navigate("/")} data-testid="btn-crews-lobby"
              className="w-full max-w-xs font-mono font-bold tracking-widest transition-all active:scale-95"
              style={{ background: "transparent", color: GOLD, padding: "14px 32px", borderRadius: 10, fontSize: 15, border: `1.5px solid ${GOLD}` }}>
              Back to Lobby
            </button>
          </div>
        </div>
        {showAuthModal && (
          <AuthModal open={showAuthModal} defaultTab="login"
            onClose={() => setShowAuthModal(false)} onSuccess={() => setShowAuthModal(false)} />
        )}
      </>
    );
  }

  if (crew === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={BG}>
        <div style={OVERLAY} />
        <p className="relative z-10 font-mono animate-pulse" style={{ color: GOLD }}>Loading…</p>
      </div>
    );
  }

  const myRole = crew ? (crew.members.find(m => m.playerId === playerId)?.role ?? "member") : "member";
  const isOwner        = myRole === "owner" || myRole === "captain";
  const isOwnerOrAgent = isOwner || myRole === "agent";

  return (
    <div className="min-h-screen pb-24" style={{ position: "relative", ...BG }}>
      <div style={OVERLAY} />
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ── Header ── */}
        {crew ? (
          <div className="sticky top-0 z-30 px-4 pt-3 pb-2"
               style={{ background: "rgba(10,8,4,0.95)", borderBottom: "1px solid rgba(240,184,41,0.15)" }}>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate("/")} className="text-amber-400 active:scale-90 transition-transform text-xl">←</button>
              <div className="flex-1 min-w-0">
                <h1 className="font-mono text-lg font-bold tracking-widest truncate" style={{ color: GOLD }}>
                  {crew.name.toUpperCase()}
                </h1>
                <div className="flex items-center gap-3">
                  {crew.clubId && (
                    <span className="font-mono text-[10px]" style={{ color: GOLD_DIM }}>ID: {crew.clubId}</span>
                  )}
                  <span className="font-mono text-[10px]" style={{ color: GOLD_DIM }}>{crew.memberCount}/25 members</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-mono" style={{ color: GOLD_DIM }}>BANK</div>
                <div className="font-mono font-bold text-sm" style={{ color: GOLD }}>
                  {(crew.chipBank ?? 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ position: "relative", paddingTop: 12, paddingBottom: 4 }}>
            <button onClick={() => navigate("/")}
              style={{ position: "absolute", top: 14, left: 14, color: "#C9A227", fontSize: 22, lineHeight: 1, zIndex: 2 }}
              className="active:scale-90 transition-transform">←</button>
            <div style={{ paddingLeft: 16, paddingRight: 16 }}>
              <img src="/crews/crews-title.png" alt="Crews"
                style={{ width: "100%", maxWidth: 320, display: "block" }} />
              <p className="font-mono uppercase text-[11px] leading-snug mt-2"
                 style={{ color: "rgba(255,255,255,0.65)" }}>
                Find your crew. Run your table.
              </p>
            </div>
          </div>
        )}

        {/* ── Views ── */}
        {crew === null ? (
          <NoCrew
            stripes={stripes}
            onCreate={() => setShowCreate(true)}
            onJoin={() => setShowJoin(true)}
            onJoined={() => { loadCrew(); toast({ title: "Joined the Club!" }); }}
          />
        ) : (
          <InClub
            crew={crew}
            playerId={playerId}
            myRole={myRole}
            isOwner={isOwner}
            isOwnerOrAgent={isOwnerOrAgent}
            tab={tab}
            onTabChange={setTab}
            onLeave={() => setLeaveTarget(crew)}
            onKick={setKickTarget}
            onReload={loadCrew}
          />
        )}

        {/* ── Modals ── */}
        {showCreate && (
          <CreateCrewModal stripes={stripes}
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); loadCrew(); toast({ title: "Club created!" }); }} />
        )}
        {showJoin && (
          <JoinCrewModal stripes={stripes}
            onClose={() => setShowJoin(false)}
            onJoined={() => { setShowJoin(false); loadCrew(); toast({ title: "Joined the Club!" }); }} />
        )}
        {leaveTarget && (
          <LeaveConfirmModal crew={leaveTarget} playerId={playerId}
            onClose={() => setLeaveTarget(null)}
            onLeft={() => { setLeaveTarget(null); setCrew(null); loadCrew(); }} />
        )}
        {kickTarget && crew && (
          <KickConfirmModal crew={crew} target={kickTarget}
            onClose={() => setKickTarget(null)}
            onKicked={() => { setKickTarget(null); loadCrew(); toast({ title: `${kickTarget.displayName} removed.` }); }} />
        )}
      </div>
    </div>
  );
}

// ─── VIEW 1: No Club ──────────────────────────────────────────────────────────
function NoCrew({ stripes, onCreate, onJoin, onJoined }: {
  stripes: number; onCreate: () => void; onJoin: () => void; onJoined: () => void;
}) {
  return (
    <div className="flex flex-col w-full max-w-lg mx-auto pb-8">

      {/* ── PUBLIC CLUBS BROWSER ── */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono font-bold tracking-[0.18em] text-sm" style={{ color: GOLD }}>OPEN CLUBS</span>
          <div style={{ flex: 1, height: 1, background: "rgba(240,184,41,0.2)" }} />
        </div>
        <PublicClubsBrowser onJoined={onJoined} stripes={stripes} />
      </div>

      <div style={{ height: 1, background: "rgba(240,184,41,0.12)", margin: "0 16px" }} />

      {/* ── CREATE A CLUB ── */}
      <div className="flex items-stretch w-full" style={{ borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 140, minHeight: 160, position: "relative" }}>
          <img src="/crews/icon-crew.png" alt="" style={{ width: 120, height: 120, objectFit: "contain" }} />
          <img src="/crews/icon-crown.png" alt="" style={{ width: 75, height: 75, objectFit: "contain", position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)" }} />
        </div>
        <div className="flex-1 py-5 pr-4" style={{ background: "rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontFamily: "'Impact','Anton','Arial Narrow',sans-serif", color: "#C9A227", textTransform: "uppercase", fontSize: 24, fontWeight: 900 }}>
              CREATE A CLUB
            </span>
            <span style={{ fontFamily: "'Impact','Anton','Arial Narrow',sans-serif", color: "#C9A227", fontSize: 20, fontWeight: 900, flexShrink: 0 }}>100◆</span>
          </div>
          <div className="flex items-center gap-1 my-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{ width: 9, height: 5, borderRadius: 3, background: "rgba(201,162,39,0.5)", border: "1px solid rgba(201,162,39,0.3)" }} />
            ))}
          </div>
          <p className="font-mono uppercase text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.70)" }}>
            START YOUR OWN CLUB. INVITE UP TO 24 MEMBERS.
          </p>
          {stripes < 100 ? (
            <button onClick={() => window.location.href = "/shop"}
              className="mt-2 font-mono uppercase text-[10px] underline tracking-wide"
              style={{ color: "#ef4444" }}>
              NEED 100 STRIPES — VISIT THE SHOP
            </button>
          ) : (
            <button onClick={onCreate} data-testid="btn-create-crew"
              className="mt-3 font-mono uppercase text-xs font-bold tracking-widest px-4 py-2 rounded-lg transition-all active:scale-95"
              style={{ background: "rgba(201,162,39,0.20)", border: "1px solid rgba(201,162,39,0.50)", color: "#C9A227" }}>
              CREATE CLUB →
            </button>
          )}
        </div>
      </div>

      {/* ── JOIN WITH CODE ── */}
      <button onClick={onJoin} data-testid="btn-join-crew"
        className="flex items-stretch w-full transition-all active:scale-[0.98]">
        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 140, minHeight: 130 }}>
          <img src="/crews/icon-code.png" alt="" style={{ width: 120, height: 120, objectFit: "contain" }} />
        </div>
        <div className="flex-1 py-5 pr-4 text-left" style={{ background: "rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "'Impact','Anton','Arial Narrow',sans-serif", color: "#C9A227", textTransform: "uppercase", fontSize: 24, fontWeight: 900 }}>
              JOIN WITH CODE
            </span>
            <span style={{ color: "#C9A227", fontSize: 20 }}>›</span>
          </div>
          <div style={{ marginTop: 6, height: 2, width: 130, background: "linear-gradient(90deg,#C9A227 0%,rgba(201,162,39,0) 100%)", borderRadius: 1 }} />
          <p className="font-mono text-[11px] mt-2" style={{ color: "rgba(255,255,255,0.55)" }}>
            Enter a 6-char invite code • 50◆
          </p>
        </div>
      </button>

    </div>
  );
}

// ─── Public clubs browser ─────────────────────────────────────────────────────
function PublicClubsBrowser({ onJoined, stripes }: { onJoined: () => void; stripes: number }) {
  const { toast } = useToast();
  const [clubs, setClubs] = useState<PublicClub[] | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/clubs/public")
      .then(r => r.ok ? r.json() : null)
      .then(d => setClubs(d?.clubs ?? []))
      .catch(() => setClubs([]));
  }, []);

  async function handleJoin(club: PublicClub) {
    if (stripes < 50) {
      toast({ title: "Need 50◆ Stripes to join. Visit the Shop.", variant: "destructive" });
      return;
    }
    setJoining(club.id);
    const res = await apiFetch("/api/crews/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: club.inviteCode }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setJoining(null);
    if (res.ok) { onJoined(); }
    else toast({ title: d?.error ?? "Failed to join.", variant: "destructive" });
  }

  if (clubs === null) {
    return (
      <p className="font-mono text-xs text-center py-4" style={{ color: GOLD_DIM }}>Loading clubs…</p>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="rounded-xl py-6 px-4 text-center" style={{ background: "rgba(240,184,41,0.04)", border: "1px solid rgba(240,184,41,0.1)" }}>
        <p className="font-mono text-sm" style={{ color: GOLD_DIM }}>No public clubs yet.</p>
        <p className="font-mono text-xs mt-1" style={{ color: "rgba(240,184,41,0.3)" }}>Create the first one.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {clubs.map(club => (
        <div key={club.id} data-testid={`club-card-${club.id}`}
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: "rgba(240,184,41,0.05)", border: "1px solid rgba(240,184,41,0.12)" }}>
          <div className="flex-1 min-w-0">
            <div className="font-mono font-bold text-sm truncate" style={{ color: "#fff" }}>
              {club.name}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="font-mono text-[10px]" style={{ color: GOLD }}>#{club.clubId}</span>
              <span className="font-mono text-[10px]" style={{ color: GOLD_DIM }}>{club.memberCount}/25 members</span>
              <span className="font-mono text-[10px]" style={{ color: GOLD_DIM }}>{club.chipBank.toLocaleString()} bank</span>
            </div>
          </div>
          <button
            onClick={() => handleJoin(club)}
            disabled={joining === club.id}
            data-testid={`btn-join-club-${club.id}`}
            className="font-mono text-[10px] font-bold tracking-widest px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50 flex-shrink-0"
            style={{ border: `1px solid ${GOLD}`, color: GOLD, background: "transparent" }}>
            {joining === club.id ? "…" : "REQUEST\nTO JOIN"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── VIEW 2/3: In Club ────────────────────────────────────────────────────────
function InClub({ crew, playerId, myRole, isOwner, isOwnerOrAgent, tab, onTabChange, onLeave, onKick, onReload }: {
  crew: CrewDetail; playerId: string;
  myRole: string; isOwner: boolean; isOwnerOrAgent: boolean;
  tab: "tables" | "members" | "bank" | "chat";
  onTabChange: (t: "tables" | "members" | "bank" | "chat") => void;
  onLeave: () => void; onKick: (m: CrewMember) => void; onReload: () => void;
}) {
  const TABS: Array<{ key: "tables" | "members" | "bank" | "chat"; label: string }> = [
    { key: "tables",  label: "TABLES"  },
    { key: "members", label: "MEMBERS" },
    { key: "bank",    label: "BANK"    },
    { key: "chat",    label: "CHAT"    },
  ];

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      {/* Tab bar */}
      <div className="grid grid-cols-4 sticky top-[72px] z-20"
           style={{ background: "rgba(10,8,4,0.95)", borderBottom: "1px solid rgba(240,184,41,0.15)" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => onTabChange(t.key)}
                  data-testid={`tab-crew-${t.key}`}
                  className="py-2.5 font-mono text-[11px] tracking-wider transition-colors"
                  style={{
                    color: tab === t.key ? GOLD : GOLD_DIM,
                    borderBottom: tab === t.key ? `2px solid ${GOLD}` : "2px solid transparent",
                  }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Invite code bar (shown on members tab) */}
      {tab === "members" && (
        <InviteBar crew={crew} isOwner={isOwner} onReload={onReload} />
      )}

      {tab === "tables"  && <TablesTab  crew={crew} playerId={playerId} isOwnerOrAgent={isOwnerOrAgent} />}
      {tab === "members" && <MembersTab crew={crew} playerId={playerId} myRole={myRole} isOwner={isOwner} isOwnerOrAgent={isOwnerOrAgent} onKick={onKick} onReload={onReload} onLeave={onLeave} />}
      {tab === "bank"    && <BankTab    crew={crew} playerId={playerId} isOwnerOrAgent={isOwnerOrAgent} onReload={onReload} />}
      {tab === "chat"    && <ChatTab    crew={crew} playerId={playerId} onReload={onReload} />}
    </div>
  );
}

// ─── Invite bar ───────────────────────────────────────────────────────────────
function InviteBar({ crew, isOwner, onReload }: { crew: CrewDetail; isOwner: boolean; onReload: () => void }) {
  const { toast } = useToast();
  const [regen, setRegen] = useState(false);

  function copyInvite() {
    navigator.clipboard.writeText(crew.inviteCode).then(
      () => toast({ title: "Invite code copied!" }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  }

  async function handleRegen() {
    setRegen(true);
    const res = await apiFetch(`/api/crews/${crew.id}/regenerate-invite`, { method: "POST" });
    const d = await res.json().catch(() => ({} as { inviteCode?: string; error?: string }));
    setRegen(false);
    if (res.ok) { onReload(); toast({ title: `New code: ${d.inviteCode}` }); }
    else toast({ title: d?.error ?? "Failed.", variant: "destructive" });
  }

  return (
    <div className="flex items-center justify-between px-4 py-2"
         style={{ borderBottom: "1px solid rgba(240,184,41,0.08)", background: "rgba(0,0,0,0.25)" }}>
      <span className="text-[10px] font-mono" style={{ color: GOLD_DIM }}>Invite code</span>
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold tracking-[0.3em] text-sm" style={{ color: GOLD }} data-testid="crew-invite-code">
          {crew.inviteCode}
        </span>
        <button onClick={copyInvite} data-testid="btn-copy-invite"
          className="text-[10px] px-2 py-0.5 rounded font-mono transition-all active:scale-90"
          style={{ background: "rgba(240,184,41,0.12)", color: GOLD, border: "1px solid rgba(240,184,41,0.25)" }}>
          COPY
        </button>
        {isOwner && (
          <button onClick={handleRegen} disabled={regen} data-testid="btn-regen-invite"
            className="text-[10px] px-2 py-0.5 rounded font-mono transition-all active:scale-90 disabled:opacity-40"
            style={{ background: "rgba(240,184,41,0.08)", color: GOLD_DIM, border: "1px solid rgba(240,184,41,0.15)" }}>
            {regen ? "…" : "↺"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Club mode map ────────────────────────────────────────────────────────────
const CLUB_MODES = [
  { id: 'badugi',     label: 'BADUGI',       path: '/badugi',     color: '#10b981' },
  { id: 'dead7',      label: 'DEAD 7',        path: '/dead7',      color: '#ef4444' },
  { id: 'fifteen35',  label: '15 / 35',       path: '/fifteen35',  color: '#f59e0b' },
  { id: 'suits_poker',label: 'SUITS & POKER', path: '/suitspoker', color: '#3b82f6' },
] as const;

type ClubModeId = typeof CLUB_MODES[number]['id'];

function modeInfo(modeId: string) {
  return CLUB_MODES.find(m => m.id === modeId) ?? { id: modeId, label: modeId.toUpperCase(), path: '/', color: '#A0A0B8' };
}

function generateTableId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Open Table modal ─────────────────────────────────────────────────────────
function OpenTableModal({ crew, playerId, onClose, onOpened }: {
  crew: CrewDetail; playerId: string;
  onClose: () => void; onOpened: (tableId: string, modeId: string) => void;
}) {
  const [selMode,     setSelMode]     = useState<ClubModeId>('badugi');
  const [maxPlayers,  setMaxPlayers]  = useState(5);
  const [creating,    setCreating]    = useState(false);
  const [err,         setErr]         = useState<string | null>(null);
  const { toast } = useToast();

  async function handleCreate() {
    setCreating(true);
    setErr(null);
    const tableId = generateTableId();
    try {
      const res = await apiFetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId,
          modeId:      selMode,
          createdBy:   playerId,
          maxPlayers,
          botsEnabled: false,
          isInviteOnly: true,
          hostId:      playerId,
          crewId:      crew.id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? 'Failed to create table.');
        setCreating(false);
        return;
      }
      toast({ title: 'Table opened', description: `${tableId} · ${selMode.toUpperCase()}` });
      onOpened(tableId, selMode);
    } catch {
      setErr('Network error — try again.');
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-2xl p-6 flex flex-col gap-5"
           style={{ background: '#1a1610', border: '1px solid rgba(240,184,41,0.2)' }}>
        <div className="flex items-center justify-between">
          <p className="font-mono text-sm font-bold tracking-widest" style={{ color: GOLD }}>OPEN TABLE</p>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 text-lg leading-none">✕</button>
        </div>

        <div>
          <p className="font-mono text-[10px] text-white/40 mb-2 tracking-widest">GAME MODE</p>
          <div className="grid grid-cols-2 gap-2">
            {CLUB_MODES.map(m => (
              <button key={m.id}
                data-testid={`mode-btn-${m.id}`}
                onClick={() => setSelMode(m.id)}
                className="rounded-lg py-2.5 px-3 font-mono text-xs font-bold tracking-wider transition-all active:scale-95"
                style={{
                  background: selMode === m.id ? `${m.color}22` : 'rgba(255,255,255,0.04)',
                  border:     `1px solid ${selMode === m.id ? m.color + '88' : 'rgba(255,255,255,0.1)'}`,
                  color:      selMode === m.id ? m.color : 'rgba(255,255,255,0.5)',
                }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] text-white/40 mb-2 tracking-widest">MAX PLAYERS</p>
          <div className="flex gap-2">
            {[2, 3, 4, 5].map(n => (
              <button key={n}
                data-testid={`maxplayers-btn-${n}`}
                onClick={() => setMaxPlayers(n)}
                className="flex-1 rounded-lg py-2 font-mono text-sm font-bold transition-all active:scale-95"
                style={{
                  background: maxPlayers === n ? 'rgba(240,184,41,0.18)' : 'rgba(255,255,255,0.04)',
                  border:     `1px solid ${maxPlayers === n ? 'rgba(240,184,41,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  color:      maxPlayers === n ? GOLD : 'rgba(255,255,255,0.4)',
                }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {err && <p className="font-mono text-xs text-red-400 text-center">{err}</p>}

        <button
          data-testid="btn-confirm-open-table"
          disabled={creating}
          onClick={handleCreate}
          className="w-full rounded-xl py-3 font-mono text-sm font-bold tracking-widest transition-all active:scale-95 disabled:opacity-50"
          style={{ background: 'rgba(240,184,41,0.18)', color: GOLD, border: `1px solid ${GOLD}` }}>
          {creating ? 'OPENING…' : 'OPEN TABLE'}
        </button>
      </div>
    </div>
  );
}

// ─── TABLES tab ───────────────────────────────────────────────────────────────
function TablesTab({ crew, playerId, isOwnerOrAgent }: {
  crew: CrewDetail; playerId: string; isOwnerOrAgent: boolean;
}) {
  const [, navigate] = useLocation();
  const { toast }    = useToast();
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);

  const { data: tables = [], refetch } = useQuery<LiveTable[]>({
    queryKey: ['club-tables', crew.id],
    queryFn: async () => {
      const res = await apiFetch(`/api/tables?crewId=${encodeURIComponent(crew.id)}`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  async function closeTable(tableId: string) {
    setClosing(tableId);
    try {
      const res = await apiFetch(`/api/tables/${tableId}`, { method: 'DELETE' });
      if (res.ok) { toast({ title: 'Table closed' }); refetch(); }
      else { const b = await res.json().catch(() => ({})); toast({ title: b.error ?? 'Failed to close', variant: 'destructive' }); }
    } catch { toast({ title: 'Network error', variant: 'destructive' }); }
    finally { setClosing(null); }
  }

  function joinTable(table: LiveTable, spectate = false) {
    const info = modeInfo(table.modeId);
    navigate(`${info.path}?t=${table.tableId}${spectate ? '&spectate=true' : ''}`);
  }

  return (
    <div className="px-4 pt-4 flex flex-col gap-4">
      {isOwnerOrAgent && (
        <button
          onClick={() => setShowOpenModal(true)}
          data-testid="btn-open-table"
          className="w-full rounded-xl py-3 font-mono text-sm font-bold tracking-widest transition-all active:scale-95"
          style={{ background: "rgba(240,184,41,0.15)", color: GOLD, border: `1px solid ${GOLD}` }}>
          + OPEN TABLE
        </button>
      )}

      {tables.length === 0 ? (
        <div className="rounded-xl py-10 text-center"
             style={{ background: "rgba(240,184,41,0.03)", border: "1px solid rgba(240,184,41,0.08)" }}>
          {isOwnerOrAgent ? (
            <p className="font-mono text-sm" style={{ color: GOLD_DIM }}>
              + OPEN TABLE to get started
            </p>
          ) : (
            <>
              <p className="font-mono text-sm" style={{ color: GOLD_DIM }}>No tables open.</p>
              <p className="font-mono text-xs mt-1" style={{ color: "rgba(240,184,41,0.3)" }}>
                Ask your agent to open one.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tables.map(table => {
            const info   = modeInfo(table.modeId);
            const isFull = table.humanCount >= table.maxPlayers;
            return (
              <div key={table.tableId} data-testid={`club-table-card-${table.tableId}`}
                   className="rounded-xl p-4 flex flex-col gap-3"
                   style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${info.color}33` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold" style={{ color: info.color }}>
                      {info.label}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      #{table.tableId}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold"
                        style={{ color: isFull ? '#ef4444' : '#10b981' }}>
                    {table.humanCount}/{table.maxPlayers}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    data-testid={`btn-join-table-${table.tableId}`}
                    disabled={isFull}
                    onClick={() => joinTable(table)}
                    className="flex-1 rounded-lg py-2 font-mono text-xs font-bold tracking-widest transition-all active:scale-95 disabled:opacity-40"
                    style={{ background: `${info.color}22`, color: info.color, border: `1px solid ${info.color}66` }}>
                    JOIN
                  </button>
                  <button
                    data-testid={`btn-spectate-table-${table.tableId}`}
                    onClick={() => joinTable(table, true)}
                    className="flex-1 rounded-lg py-2 font-mono text-xs font-bold tracking-widest transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    SPECTATE
                  </button>
                  {isOwnerOrAgent && (
                    <button
                      data-testid={`btn-close-table-${table.tableId}`}
                      disabled={closing === table.tableId}
                      onClick={() => closeTable(table.tableId)}
                      className="rounded-lg py-2 px-3 font-mono text-xs font-bold tracking-widest transition-all active:scale-95 disabled:opacity-40"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                      {closing === table.tableId ? '…' : 'CLOSE'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showOpenModal && (
        <OpenTableModal
          crew={crew}
          playerId={playerId}
          onClose={() => setShowOpenModal(false)}
          onOpened={(tableId, modeId) => {
            setShowOpenModal(false);
            const info = modeInfo(modeId);
            navigate(`${info.path}?t=${tableId}`);
          }}
        />
      )}
    </div>
  );
}

// ─── MEMBERS tab ──────────────────────────────────────────────────────────────
function MembersTab({ crew, playerId, myRole: _myRole, isOwner, isOwnerOrAgent, onKick, onReload, onLeave }: {
  crew: CrewDetail; playerId: string; myRole: string;
  isOwner: boolean; isOwnerOrAgent: boolean;
  onKick: (m: CrewMember) => void; onReload: () => void; onLeave: () => void;
}) {
  const { toast } = useToast();
  const [sendTarget, setSendTarget] = useState<CrewMember | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(crew.name);
  const [editDesc, setEditDesc] = useState(crew.description ?? "");
  const [saving, setSaving] = useState(false);

  const sorted = [...crew.members].sort((a, b) => {
    const rOrder = (r: string) => r === "owner" || r === "captain" ? 0 : r === "agent" ? 1 : 2;
    return rOrder(a.role) - rOrder(b.role) || b.totalChipsWon - a.totalChipsWon;
  });

  async function handleAppoint(m: CrewMember) {
    const res = await apiFetch(`/api/crews/${crew.id}/appoint-agent`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPlayerId: m.playerId }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    if (res.ok) { onReload(); toast({ title: `${m.displayName} is now an Agent.` }); }
    else toast({ title: d?.error ?? "Failed.", variant: "destructive" });
  }

  async function handleRemoveAgent(m: CrewMember) {
    const res = await apiFetch(`/api/crews/${crew.id}/remove-agent`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPlayerId: m.playerId }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    if (res.ok) { onReload(); toast({ title: `${m.displayName} demoted to member.` }); }
    else toast({ title: d?.error ?? "Failed.", variant: "destructive" });
  }

  async function handleRename() {
    if (!editName.trim()) return;
    setSaving(true);
    const res = await apiFetch(`/api/crews/${crew.id}/rename`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setSaving(false);
    if (res.ok) { onReload(); setEditMode(false); toast({ title: "Club updated." }); }
    else toast({ title: d?.error ?? "Failed to rename.", variant: "destructive" });
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-3 pb-6">

      {/* Owner edit club settings */}
      {isOwner && (
        <div className="rounded-xl overflow-hidden mb-1" style={{ border: "1px solid rgba(240,184,41,0.18)" }}>
          <button onClick={() => setEditMode(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 font-mono text-xs tracking-wider transition-colors"
            style={{ background: "rgba(240,184,41,0.07)", color: GOLD }}>
            <span>CLUB SETTINGS</span>
            <span>{editMode ? "▲" : "▼"}</span>
          </button>
          {editMode && (
            <div className="px-4 py-3 flex flex-col gap-3" style={{ background: "rgba(10,8,4,0.6)" }}>
              <div>
                <label className="text-[10px] font-mono" style={{ color: GOLD_DIM }}>Club name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} maxLength={30}
                  data-testid="input-rename-crew"
                  className="w-full rounded-lg px-3 py-2 mt-1 text-sm font-mono outline-none"
                  style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: GOLD }} />
              </div>
              <div>
                <label className="text-[10px] font-mono" style={{ color: GOLD_DIM }}>Description (optional)</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} maxLength={200} rows={2}
                  data-testid="input-crew-description"
                  className="w-full rounded-lg px-3 py-2 mt-1 text-sm font-mono outline-none resize-none"
                  style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: GOLD }} />
              </div>
              <button onClick={handleRename} disabled={saving || editName.trim().length < 3}
                data-testid="btn-save-crew-info"
                className="rounded-lg py-2 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
                style={{ background: "rgba(240,184,41,0.15)", color: GOLD, border: "1px solid rgba(240,184,41,0.35)" }}>
                {saving ? "Saving…" : "SAVE CHANGES"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Member list */}
      {sorted.map(m => {
        const isMe = m.playerId === playerId;
        const isMemberOwner = m.role === "owner" || m.role === "captain";
        return (
          <div key={m.id} data-testid={`roster-row-${m.playerId}`}
               className="flex items-center gap-3 rounded-xl px-3 py-2.5"
               style={{ background: "rgba(240,184,41,0.04)", border: "1px solid rgba(240,184,41,0.08)" }}>
            <AvatarChip name={m.displayName} size={34} equippedFrameId={m.equippedFrameId} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-sm truncate" style={{ color: "#fff" }}>{m.displayName}</span>
                {roleBadge(m.role)}
                {isMe && (
                  <span className="text-[9px] font-mono px-1 rounded" style={{ background: "rgba(255,255,255,0.06)", color: GOLD_DIM }}>YOU</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] font-mono" style={{ color: "rgba(240,184,41,0.35)" }}>
                  {m.totalChipsWon.toLocaleString()} chips won
                </p>
                {m.chipBalance !== undefined && (
                  <p className="text-[10px] font-mono" style={{ color: GOLD_DIM }}>
                    {m.chipBalance.toLocaleString()} chips
                  </p>
                )}
              </div>
            </div>
            {/* Owner/Agent: send chips to any non-self member */}
            {isOwnerOrAgent && !isMe && (
              <button onClick={() => setSendTarget(m)} data-testid={`btn-send-chips-${m.playerId}`}
                className="text-[10px] px-2 py-1 rounded font-mono transition-all active:scale-90 flex-shrink-0"
                style={{ background: "rgba(240,184,41,0.12)", color: GOLD, border: "1px solid rgba(240,184,41,0.25)" }}>
                SEND
              </button>
            )}
            {/* Owner only: promote/demote agents, kick members */}
            {isOwner && !isMe && !isMemberOwner && (
              <>
                {m.role === "agent" ? (
                  <button onClick={() => handleRemoveAgent(m)} data-testid={`btn-remove-agent-${m.playerId}`}
                    className="text-[10px] px-2 py-1 rounded font-mono transition-all active:scale-90 flex-shrink-0"
                    style={{ background: "rgba(180,180,180,0.1)", color: "#aaa", border: "1px solid rgba(180,180,180,0.2)" }}>
                    −AGENT
                  </button>
                ) : (
                  <button onClick={() => handleAppoint(m)} data-testid={`btn-appoint-agent-${m.playerId}`}
                    className="text-[10px] px-2 py-1 rounded font-mono transition-all active:scale-90 flex-shrink-0"
                    style={{ background: "rgba(180,180,180,0.1)", color: "#aaa", border: "1px solid rgba(180,180,180,0.2)" }}>
                    +AGENT
                  </button>
                )}
                <button onClick={() => onKick(m)} data-testid={`btn-kick-${m.playerId}`}
                  className="text-[10px] px-2 py-1 rounded font-mono transition-all active:scale-90 flex-shrink-0"
                  style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
                  KICK
                </button>
              </>
            )}
          </div>
        );
      })}

      {/* Leave */}
      <button onClick={onLeave} data-testid="btn-leave-crew"
        className="w-full mt-2 rounded-xl py-3 font-mono text-sm font-bold tracking-wider transition-all active:scale-95"
        style={{ background: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
        LEAVE CLUB
      </button>

      {/* Send chips modal */}
      {sendTarget && (
        <SendChipsModal crew={_fakeCrewRef()} target={sendTarget}
          onClose={() => setSendTarget(null)}
          onSent={() => { setSendTarget(null); onReload(); }} />
      )}
    </div>
  );

  function _fakeCrewRef() { return crew; }
}

// ─── BANK tab ─────────────────────────────────────────────────────────────────
function BankTab({ crew, playerId, isOwnerOrAgent, onReload }: {
  crew: CrewDetail; playerId: string; isOwnerOrAgent: boolean; onReload: () => void;
}) {
  const { toast } = useToast();
  const [showFund, setShowFund]         = useState(false);
  const [showRequest, setShowRequest]   = useState(false);
  const [requests, setRequests]         = useState<ChipRequest[] | null>(null);
  const [resolving, setResolving]       = useState<number | null>(null);

  const loadRequests = useCallback(async () => {
    const res = await apiFetch(`/api/crews/${crew.id}/chip-requests`);
    if (res.ok) { const d = await res.json(); setRequests(d.requests ?? []); }
    else setRequests([]);
  }, [crew.id]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function handleResolve(reqId: number, approve: boolean) {
    setResolving(reqId);
    const res = await apiFetch(`/api/crews/${crew.id}/requests/${reqId}/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setResolving(null);
    if (res.ok) { loadRequests(); onReload(); toast({ title: approve ? "Chips sent!" : "Request rejected." }); }
    else toast({ title: d?.error ?? "Failed.", variant: "destructive" });
  }

  const pendingRequests = (requests ?? []).filter(r => r.status === "pending");
  const myRequests      = (requests ?? []).filter(r => !isOwnerOrAgent);

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">

      {/* Bank balance */}
      <div className="rounded-2xl py-6 px-4 text-center"
           style={{ background: "rgba(240,184,41,0.06)", border: "1px solid rgba(240,184,41,0.2)" }}>
        <p className="font-mono text-xs tracking-widest mb-1" style={{ color: GOLD_DIM }}>CLUB BANK</p>
        <p className="font-mono font-bold text-4xl" style={{ color: GOLD }} data-testid="bank-balance">
          {(crew.chipBank ?? 0).toLocaleString()}
        </p>
        <p className="font-mono text-xs mt-1" style={{ color: "rgba(240,184,41,0.35)" }}>chips</p>
      </div>

      {/* Owner/Agent: Fund Bank */}
      {isOwnerOrAgent && (
        <button onClick={() => setShowFund(true)} data-testid="btn-fund-bank"
          className="w-full rounded-xl py-3 font-mono text-sm font-bold tracking-widest transition-all active:scale-95"
          style={{ background: "rgba(240,184,41,0.15)", color: GOLD, border: `1px solid ${GOLD}` }}>
          FUND BANK
        </button>
      )}

      {/* Member: Request Chips */}
      {!isOwnerOrAgent && (
        <button onClick={() => setShowRequest(true)} data-testid="btn-request-chips"
          className="w-full rounded-xl py-3 font-mono text-sm font-bold tracking-widest transition-all active:scale-95"
          style={{ background: "rgba(240,184,41,0.1)", color: GOLD, border: `1px solid rgba(240,184,41,0.4)` }}>
          REQUEST CHIPS
        </button>
      )}

      {/* Owner/Agent: Pending requests */}
      {isOwnerOrAgent && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-xs tracking-wider" style={{ color: GOLD }}>PENDING REQUESTS</span>
            {pendingRequests.length > 0 && (
              <span className="rounded-full text-[9px] font-mono px-1.5 py-0.5" style={{ background: "rgba(240,184,41,0.2)", color: GOLD }}>
                {pendingRequests.length}
              </span>
            )}
          </div>
          {requests === null ? (
            <p className="font-mono text-xs text-center py-4" style={{ color: GOLD_DIM }}>Loading…</p>
          ) : pendingRequests.length === 0 ? (
            <p className="font-mono text-xs text-center py-4 rounded-xl"
               style={{ color: GOLD_DIM, background: "rgba(240,184,41,0.03)", border: "1px solid rgba(240,184,41,0.08)" }}>
              No pending requests.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingRequests.map(req => (
                <div key={req.id} data-testid={`chip-request-${req.id}`}
                     className="flex items-center gap-3 rounded-xl px-4 py-3"
                     style={{ background: "rgba(240,184,41,0.05)", border: "1px solid rgba(240,184,41,0.12)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-bold" style={{ color: "#fff" }}>{req.playerName ?? req.playerId.slice(0, 8)}</p>
                    <p className="font-mono text-xs" style={{ color: GOLD }}>{req.amount.toLocaleString()} chips</p>
                    <p className="font-mono text-[10px] mt-0.5" style={{ color: "rgba(240,184,41,0.3)" }}>
                      {new Date(req.requestedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button onClick={() => handleResolve(req.id, true)}
                      disabled={resolving === req.id}
                      data-testid={`btn-approve-request-${req.id}`}
                      className="px-3 py-1 rounded-lg font-mono text-[10px] font-bold transition-all active:scale-95 disabled:opacity-40"
                      style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>
                      {resolving === req.id ? "…" : "APPROVE"}
                    </button>
                    <button onClick={() => handleResolve(req.id, false)}
                      disabled={resolving === req.id}
                      data-testid={`btn-reject-request-${req.id}`}
                      className="px-3 py-1 rounded-lg font-mono text-[10px] font-bold transition-all active:scale-95 disabled:opacity-40"
                      style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
                      REJECT
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Member: Own request history */}
      {!isOwnerOrAgent && (
        <div>
          <p className="font-mono text-xs tracking-wider mb-2" style={{ color: GOLD }}>MY REQUESTS</p>
          {requests === null ? (
            <p className="font-mono text-xs text-center py-4" style={{ color: GOLD_DIM }}>Loading…</p>
          ) : myRequests.length === 0 ? (
            <p className="font-mono text-xs text-center py-3 rounded-xl"
               style={{ color: GOLD_DIM, background: "rgba(240,184,41,0.03)", border: "1px solid rgba(240,184,41,0.08)" }}>
              No requests yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {(requests).map(req => (
                <div key={req.id} data-testid={`my-request-${req.id}`}
                     className="flex items-center justify-between rounded-xl px-4 py-3"
                     style={{ background: "rgba(240,184,41,0.04)", border: "1px solid rgba(240,184,41,0.08)" }}>
                  <div>
                    <p className="font-mono text-sm" style={{ color: "#fff" }}>{req.amount.toLocaleString()} chips</p>
                    <p className="font-mono text-[10px] mt-0.5" style={{ color: "rgba(240,184,41,0.35)" }}>
                      {new Date(req.requestedAt).toLocaleString([], { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] px-2 py-1 rounded"
                        style={{
                          background: req.status === "approved" ? "rgba(34,197,94,0.15)" : req.status === "rejected" ? "rgba(239,68,68,0.12)" : "rgba(240,184,41,0.12)",
                          color:      req.status === "approved" ? "#22c55e" : req.status === "rejected" ? "#ef4444" : GOLD,
                        }}>
                    {req.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showFund && (
        <FundBankModal crew={crew}
          onClose={() => setShowFund(false)}
          onFunded={() => { setShowFund(false); onReload(); toast({ title: "Bank funded!" }); }} />
      )}
      {showRequest && (
        <RequestChipsModal crew={crew}
          onClose={() => setShowRequest(false)}
          onRequested={() => { setShowRequest(false); loadRequests(); toast({ title: "Request submitted!" }); }} />
      )}
    </div>
  );
}

// ─── CHAT tab ─────────────────────────────────────────────────────────────────
function ChatTab({ crew, playerId }: { crew: CrewDetail; playerId: string; onReload: () => void }) {
  const { toast }           = useToast();
  const [msgs, setMsgs]     = useState<ChatMsg[]>([]);
  const [text, setText]     = useState("");
  const [sending, setSend]  = useState(false);
  const bottomRef           = useRef<HTMLDivElement>(null);
  const seenIds             = useRef<Set<string>>(new Set());
  const [crewMenu, setCrewMenu]               = useState<{ msgId: string; name: string; pid: string; x: number; y: number } | null>(null);
  const [crewBlockTarget, setCrewBlockTarget] = useState<{ name: string; pid: string } | null>(null);
  const [crewBlocking, setCrewBlocking]       = useState(false);
  const [crewReportTarget, setCrewReportTarget] = useState<{ name: string; pid: string; msgId: string } | null>(null);
  const [crewReportReason, setCrewReportReason] = useState('harassment');
  const [crewReportNotes, setCrewReportNotes]   = useState('');
  const [crewReporting, setCrewReporting]       = useState(false);
  const longPressRef                            = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef             = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMsgs = useCallback(async () => {
    const res = await apiFetch(`/api/crews/${crew.id}/chat?limit=50`);
    if (!res.ok) return;
    const d = await res.json().catch(() => ({} as { messages?: ChatMsg[] }));
    const incoming: ChatMsg[] = d.messages ?? [];
    const newOnes = incoming.filter(m => !seenIds.current.has(m.id));
    if (newOnes.length > 0) {
      newOnes.forEach(m => seenIds.current.add(m.id));
      setMsgs(prev => {
        const all = [...prev, ...newOnes].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return all.slice(-200);
      });
    }
  }, [crew.id]);

  useEffect(() => {
    fetchMsgs();
    pollRef.current = setInterval(fetchMsgs, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMsgs]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  useEffect(() => {
    if (!crewMenu) return;
    const close = () => setCrewMenu(null);
    document.addEventListener('click', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('click', close); document.removeEventListener('touchstart', close); };
  }, [crewMenu]);

  function startLongPress(m: ChatMsg) {
    return (e: React.TouchEvent) => {
      if (m.playerId === playerId) return;
      const t = e.touches[0];
      const x = t?.clientX ?? 0; const y = t?.clientY ?? 0;
      if (longPressRef.current) clearTimeout(longPressRef.current);
      longPressRef.current = setTimeout(() => setCrewMenu({ msgId: m.id, name: m.playerName, pid: m.playerId, x, y }), 500);
    };
  }
  function cancelLongPress() {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  }

  async function confirmCrewBlock() {
    if (!crewBlockTarget) return;
    setCrewBlocking(true);
    try {
      const res = await apiFetch('/api/players/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blockedId: crewBlockTarget.pid }) });
      const d = await res.json().catch(() => ({} as { error?: string }));
      if (res.ok) toast({ title: `Blocked ${crewBlockTarget.name}` });
      else toast({ title: d?.error ?? 'Could not block player.', variant: 'destructive' });
    } catch { toast({ title: 'Network error.', variant: 'destructive' }); }
    finally { setCrewBlocking(false); setCrewBlockTarget(null); }
  }

  async function submitCrewReport() {
    if (!crewReportTarget) return;
    setCrewReporting(true);
    try {
      const res = await apiFetch('/api/players/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportedId: crewReportTarget.pid, reason: crewReportReason, context: crewReportTarget.msgId, contextType: 'crew_chat', notes: crewReportNotes.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({} as { error?: string }));
      if (res.ok) toast({ title: 'Report submitted. Our team will review it.' });
      else toast({ title: d?.error ?? 'Could not submit report.', variant: 'destructive' });
    } catch { toast({ title: 'Network error.', variant: 'destructive' }); }
    finally { setCrewReporting(false); setCrewReportTarget(null); setCrewReportReason('harassment'); setCrewReportNotes(''); }
  }

  async function send() {
    if (!text.trim() || sending) return;
    setSend(true);
    const res = await apiFetch(`/api/crews/${crew.id}/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text.trim() }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setSend(false);
    if (res.ok) { setText(""); fetchMsgs(); }
    else if (res.status === 422) toast({ title: "Message blocked — please keep it clean.", variant: "destructive" });
    else if (res.status === 429) toast({ title: "Slow down — too many messages.", variant: "destructive" });
    else toast({ title: d?.error ?? "Failed to send.", variant: "destructive" });
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) { if (e.key === "Enter") send(); }

  const memberRole = (pid: string) => crew.members.find(m => m.playerId === pid)?.role ?? "member";

  return (
    <>
      {crewMenu && (
        <div className="fixed z-[200] rounded-xl shadow-2xl py-1 border min-w-[160px]"
             style={{ top: crewMenu.y, left: Math.min(crewMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 400) - 180), background: '#1a1a1f', borderColor: 'rgba(255,255,255,0.08)' }}
             onClick={e => e.stopPropagation()} data-testid="crew-chat-context-menu">
          <button className="w-full text-left px-4 py-2.5 text-xs font-mono" style={{ color: 'rgba(220,80,80,0.80)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { setCrewBlockTarget({ name: crewMenu.name, pid: crewMenu.pid }); setCrewMenu(null); }}
            data-testid="crew-chat-menu-block">Block {crewMenu.name}</button>
          <button className="w-full text-left px-4 py-2.5 text-xs font-mono" style={{ color: 'rgba(201,162,39,0.80)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { setCrewReportTarget({ name: crewMenu.name, pid: crewMenu.pid, msgId: crewMenu.msgId }); setCrewMenu(null); }}
            data-testid="crew-chat-menu-report">Report {crewMenu.name}</button>
        </div>
      )}
      {crewBlockTarget && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center px-4"
             style={{ background: 'rgba(0,0,0,0.60)' }}
             onClick={() => setCrewBlockTarget(null)} data-testid="crew-block-confirm-overlay">
          <div className="w-full max-w-xs rounded-2xl p-5 space-y-4"
               style={{ background: '#17171c', border: '1px solid rgba(255,255,255,0.08)' }}
               onClick={e => e.stopPropagation()} data-testid="crew-block-confirm-modal">
            <div>
              <div className="text-sm font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.85)' }}>Block {crewBlockTarget.name}?</div>
              <p className="text-xs font-mono leading-relaxed" style={{ color: 'rgba(255,255,255,0.40)' }}>You won't see their messages. You can unblock them in Settings.</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest transition-all active:scale-[0.97]"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.40)' }}
                onClick={() => setCrewBlockTarget(null)} data-testid="crew-block-confirm-cancel">Cancel</button>
              <button className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest transition-all active:scale-[0.97] disabled:opacity-50"
                style={{ background: 'rgba(220,80,80,0.20)', color: 'rgba(220,80,80,0.90)' }}
                onClick={confirmCrewBlock} disabled={crewBlocking} data-testid="crew-block-confirm-submit">
                {crewBlocking ? 'Blocking…' : 'Block'}</button>
            </div>
          </div>
        </div>
      )}
      {crewReportTarget && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center px-4"
             style={{ background: 'rgba(0,0,0,0.60)' }}
             onClick={() => { setCrewReportTarget(null); setCrewReportReason('harassment'); setCrewReportNotes(''); }}
             data-testid="crew-report-modal-overlay">
          <div className="w-full max-w-xs rounded-2xl p-5 space-y-4"
               style={{ background: '#17171c', border: '1px solid rgba(255,255,255,0.08)' }}
               onClick={e => e.stopPropagation()} data-testid="crew-report-modal">
            <div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>Report {crewReportTarget.name}</div>
              <p className="text-xs font-mono leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>Our team reviews all reports.</p>
            </div>
            <div>
              <label className="block mb-1.5 text-[9px] font-mono uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.30)' }}>Reason</label>
              <select value={crewReportReason} onChange={e => setCrewReportReason(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm font-mono border focus:outline-none"
                style={{ background: 'rgba(0,0,0,0.40)', color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.08)' }}
                data-testid="crew-report-reason-select">
                <option value="harassment">Harassment</option>
                <option value="cheating">Cheating</option>
                <option value="spam">Spam</option>
                <option value="offensive_language">Offensive Language</option>
                <option value="impersonation">Impersonation</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block mb-1.5 text-[9px] font-mono uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.30)' }}>Notes (optional)</label>
              <textarea value={crewReportNotes} onChange={e => setCrewReportNotes(e.target.value)}
                maxLength={500} rows={3} placeholder="Additional details…"
                className="w-full rounded-xl px-3 py-2 text-sm font-mono border focus:outline-none resize-none"
                style={{ background: 'rgba(0,0,0,0.40)', color: 'rgba(255,255,255,0.65)', borderColor: 'rgba(255,255,255,0.08)' }}
                data-testid="crew-report-notes-textarea" />
              <div className="text-right text-[9px] font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.20)' }} data-testid="crew-report-notes-counter">
                {crewReportNotes.length}/500
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest transition-all active:scale-[0.97]"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.40)' }}
                onClick={() => { setCrewReportTarget(null); setCrewReportReason('harassment'); setCrewReportNotes(''); }}
                data-testid="crew-report-cancel">Cancel</button>
              <button className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest transition-all active:scale-[0.97] disabled:opacity-50"
                style={{ background: 'rgba(201,162,39,0.20)', color: 'rgba(201,162,39,0.90)' }}
                onClick={submitCrewReport} disabled={crewReporting} data-testid="crew-report-submit">
                {crewReporting ? 'Sending…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col" style={{ height: "calc(100vh - 190px)" }}>
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
          {msgs.length === 0 && (
            <p className="text-center text-xs font-mono pt-8" style={{ color: "rgba(240,184,41,0.3)" }}>No messages yet. Say something.</p>
          )}
          {msgs.map(m => {
            const role = memberRole(m.playerId);
            const isMe = m.playerId === playerId;
            return (
              <div key={m.id} data-testid={`chat-msg-${m.id}`}
                   className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                <AvatarChip name={m.playerName} size={26} />
                <div className={`flex flex-col max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-mono" style={{ color: "rgba(240,184,41,0.5)" }}>{m.playerName}</span>
                    {(role === "owner" || role === "captain") && (
                      <span className="text-[8px] font-mono px-0.5 rounded" style={{ background: "rgba(240,184,41,0.15)", color: GOLD }}>OWNER</span>
                    )}
                    {role === "agent" && (
                      <span className="text-[8px] font-mono px-0.5 rounded" style={{ background: "rgba(180,180,180,0.12)", color: "#aaa" }}>AGENT</span>
                    )}
                  </div>
                  <div className="rounded-xl px-3 py-1.5 text-xs font-mono break-words select-none"
                       style={{ background: isMe ? "rgba(240,184,41,0.18)" : "rgba(255,255,255,0.06)", color: isMe ? GOLD : "rgba(240,184,41,0.8)", border: "1px solid rgba(240,184,41,0.10)" }}
                       onContextMenu={!isMe ? (e) => { e.preventDefault(); setCrewMenu({ msgId: m.id, name: m.playerName, pid: m.playerId, x: e.clientX, y: e.clientY }); } : undefined}
                       onTouchStart={!isMe ? startLongPress(m) : undefined}
                       onTouchEnd={!isMe ? cancelLongPress : undefined}
                       onTouchMove={!isMe ? cancelLongPress : undefined}>
                    {m.message}
                  </div>
                  <span className="text-[9px] font-mono mt-0.5" style={{ color: "rgba(240,184,41,0.25)" }}>
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="px-4 pb-3 flex gap-2 pt-2" style={{ borderTop: "1px solid rgba(240,184,41,0.10)" }}>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKey}
            maxLength={500} placeholder="Say something…" data-testid="input-crew-chat"
            className="flex-1 rounded-xl px-3 py-2 text-sm font-mono outline-none"
            style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: GOLD }} />
          <button onClick={send} disabled={!text.trim() || sending} data-testid="btn-send-chat"
            className="rounded-xl px-4 py-2 font-mono text-xs font-bold transition-all active:scale-90 disabled:opacity-40"
            style={{ background: "rgba(240,184,41,0.2)", color: GOLD, border: "1px solid rgba(240,184,41,0.4)" }}>
            SEND
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Send Chips modal ─────────────────────────────────────────────────────────
function SendChipsModal({ crew, target, onClose, onSent }: {
  crew: CrewDetail; target: CrewMember; onClose: () => void; onSent: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) return;
    setLoading(true);
    const res = await apiFetch(`/api/crews/${crew.id}/distribute`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPlayerId: target.playerId, amount: amt }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setLoading(false);
    if (res.ok) onSent();
    else toast({ title: d?.error ?? "Failed to send chips.", variant: "destructive" });
  }

  return (
    <Modal onClose={onClose} title={`SEND CHIPS TO ${target.displayName.toUpperCase()}`}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-mono" style={{ color: GOLD_DIM }}>Amount</label>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 1000" data-testid="input-send-amount"
            className="w-full rounded-lg px-3 py-2 mt-1 text-xl font-mono outline-none text-center"
            style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: GOLD }} />
        </div>
        <button onClick={handleSend} disabled={!amount || loading || parseInt(amount,10) <= 0}
          data-testid="btn-confirm-send-chips"
          className="w-full rounded-xl py-3 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "rgba(240,184,41,0.2)", color: GOLD, border: "1px solid rgba(240,184,41,0.5)" }}>
          {loading ? "Sending…" : `SEND ${amount ? parseInt(amount,10).toLocaleString() : "—"} CHIPS`}
        </button>
      </div>
    </Modal>
  );
}

// ─── Request Chips modal ──────────────────────────────────────────────────────
function RequestChipsModal({ crew, onClose, onRequested }: {
  crew: CrewDetail; onClose: () => void; onRequested: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRequest() {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) return;
    setLoading(true);
    const res = await apiFetch(`/api/crews/${crew.id}/request-chips`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amt }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setLoading(false);
    if (res.ok) onRequested();
    else toast({ title: d?.error ?? "Failed to submit request.", variant: "destructive" });
  }

  return (
    <Modal onClose={onClose} title="REQUEST CHIPS">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-mono" style={{ color: GOLD_DIM }}>How many chips do you need?</label>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 5000" data-testid="input-request-amount"
            className="w-full rounded-lg px-3 py-2 mt-1 text-xl font-mono outline-none text-center"
            style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: GOLD }} />
        </div>
        <p className="text-xs font-mono text-center" style={{ color: "rgba(240,184,41,0.4)" }}>
          Your owner or agent will approve the request.
        </p>
        <button onClick={handleRequest} disabled={!amount || loading || parseInt(amount,10) <= 0}
          data-testid="btn-confirm-request-chips"
          className="w-full rounded-xl py-3 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "rgba(240,184,41,0.12)", color: GOLD, border: `1px solid ${GOLD}` }}>
          {loading ? "Requesting…" : `REQUEST ${amount ? parseInt(amount,10).toLocaleString() : "—"} CHIPS`}
        </button>
      </div>
    </Modal>
  );
}

// ─── Fund Bank modal ──────────────────────────────────────────────────────────
function FundBankModal({ crew, onClose, onFunded }: {
  crew: CrewDetail; onClose: () => void; onFunded: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleFund() {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) return;
    setLoading(true);
    const res = await apiFetch(`/api/crews/${crew.id}/fund-bank`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amt }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setLoading(false);
    if (res.ok) onFunded();
    else toast({ title: d?.error ?? "Failed to fund bank.", variant: "destructive" });
  }

  return (
    <Modal onClose={onClose} title="FUND CLUB BANK">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-mono" style={{ color: GOLD_DIM }}>Transfer from your chips to club bank</label>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 10000" data-testid="input-fund-amount"
            className="w-full rounded-lg px-3 py-2 mt-1 text-xl font-mono outline-none text-center"
            style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: GOLD }} />
        </div>
        <div className="text-center text-xs font-mono" style={{ color: GOLD_DIM }}>
          Current bank: {(crew.chipBank ?? 0).toLocaleString()} chips
        </div>
        <button onClick={handleFund} disabled={!amount || loading || parseInt(amount,10) <= 0}
          data-testid="btn-confirm-fund-bank"
          className="w-full rounded-xl py-3 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "rgba(240,184,41,0.2)", color: GOLD, border: `1px solid ${GOLD}` }}>
          {loading ? "Funding…" : `ADD ${amount ? parseInt(amount,10).toLocaleString() : "—"} TO BANK`}
        </button>
      </div>
    </Modal>
  );
}

// ─── Create Crew modal ────────────────────────────────────────────────────────
function CreateCrewModal({ stripes, onClose, onCreated }: {
  stripes: number; onClose: () => void; onCreated: () => void;
}) {
  const { toast }             = useToast();
  const [name, setName]       = useState("");
  const [desc, setDesc]       = useState("");
  const [loading, setLoading] = useState(false);

  const nameErr  = name.trim().length > 0 && (name.trim().length < 3 ? "Min 3 chars" : name.trim().length > 30 ? "Max 30 chars" : null);
  const canCreate = name.trim().length >= 3 && name.trim().length <= 30 && stripes >= 100;

  async function handleCreate() {
    if (!canCreate) return;
    setLoading(true);
    const res = await apiFetch("/api/crews/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: desc.trim() || undefined }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setLoading(false);
    if (res.ok)        onCreated();
    else if (d?.error) toast({ title: d.error, variant: "destructive" });
    else               toast({ title: "Failed to create Club.", variant: "destructive" });
  }

  return (
    <Modal onClose={onClose} title="CREATE A CLUB">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-mono" style={{ color: GOLD_DIM }}>Club name *</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="3–30 characters"
            data-testid="input-crew-name"
            className="w-full rounded-lg px-3 py-2 mt-1 text-sm font-mono outline-none"
            style={{ background: "rgba(240,184,41,0.07)", border: `1px solid ${nameErr ? "#ef4444" : "rgba(240,184,41,0.2)"}`, color: GOLD }} />
          {nameErr && <p className="text-xs mt-0.5" style={{ color: "#ef4444" }}>{nameErr}</p>}
        </div>
        <div>
          <label className="text-xs font-mono" style={{ color: GOLD_DIM }}>Description (optional)</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} maxLength={200} rows={3}
            placeholder="What's your Club about?" data-testid="input-create-crew-desc"
            className="w-full rounded-lg px-3 py-2 mt-1 text-sm font-mono outline-none resize-none"
            style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: GOLD }} />
        </div>
        <div className="flex justify-between items-center text-xs font-mono" style={{ color: "#C9A227" }}>
          <span>Your balance: {stripes.toLocaleString()}◆</span>
          <span>Cost: 100◆</span>
        </div>
        {stripes < 100 && (
          <p className="text-xs font-mono text-center" style={{ color: "#ef4444" }}>Need 100 Stripes — visit the Shop.</p>
        )}
        <button onClick={handleCreate} disabled={!canCreate || loading} data-testid="btn-confirm-create-crew"
          className="w-full rounded-xl py-3 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "rgba(201,162,39,0.20)", color: "#C9A227", border: "1px solid rgba(201,162,39,0.5)" }}>
          {loading ? "Creating…" : "CREATE FOR 100◆"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Join Crew modal ──────────────────────────────────────────────────────────
function JoinCrewModal({ stripes, onClose, onJoined }: {
  stripes: number; onClose: () => void; onJoined: () => void;
}) {
  const { toast }                   = useToast();
  const [code, setCode]             = useState("");
  const [preview, setPreview]       = useState<{ name: string; memberCount: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading]       = useState(false);

  async function fetchPreview(c: string) {
    if (c.length !== 6) { setPreview(null); return; }
    setPreviewing(true);
    const res = await apiFetch(`/api/crews/preview/${c.toUpperCase()}`);
    const d = await res.json().catch(() => ({} as { name?: string; memberCount?: number }));
    setPreviewing(false);
    if (res.ok) setPreview({ name: d.name as string, memberCount: d.memberCount as number });
    else setPreview(null);
  }

  function handleCode(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.toUpperCase().slice(0, 6);
    setCode(v);
    fetchPreview(v);
  }

  async function handleJoin() {
    setLoading(true);
    const res = await apiFetch("/api/crews/join", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: code }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setLoading(false);
    if (res.ok)        onJoined();
    else if (d?.error) toast({ title: d.error, variant: "destructive" });
    else               toast({ title: "Failed to join Club.", variant: "destructive" });
  }

  const canJoin = code.length === 6 && !!preview && preview.memberCount < 25 && stripes >= 50;

  return (
    <Modal onClose={onClose} title="JOIN WITH CODE">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-mono" style={{ color: GOLD_DIM }}>Enter invite code</label>
          <input value={code} onChange={handleCode} maxLength={6} placeholder="XXXXXX"
            data-testid="input-invite-code"
            className="w-full rounded-lg px-3 py-2 mt-1 text-xl font-mono tracking-[0.4em] outline-none text-center"
            style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: GOLD }} />
        </div>
        {previewing && <p className="text-xs text-center font-mono" style={{ color: GOLD_DIM }}>Looking up…</p>}
        {preview && (
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(240,184,41,0.08)", border: "1px solid rgba(240,184,41,0.2)" }}>
            <p className="font-mono font-bold" style={{ color: GOLD }}>{preview.name}</p>
            <p className="text-xs mt-1 font-mono" style={{ color: GOLD_DIM }}>{preview.memberCount}/25 members</p>
            {preview.memberCount >= 25 && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>This Club is full.</p>}
          </div>
        )}
        <div className="flex justify-between items-center text-xs font-mono" style={{ color: "#C9A227" }}>
          <span>Your balance: {stripes.toLocaleString()}◆</span>
          <span>Cost: 50◆</span>
        </div>
        <button onClick={handleJoin} disabled={!canJoin || loading} data-testid="btn-confirm-join-crew"
          className="w-full rounded-xl py-3 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "rgba(201,162,39,0.15)", color: "#C9A227", border: "1px solid rgba(201,162,39,0.35)" }}>
          {loading ? "Joining…" : "JOIN FOR 50◆"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Leave confirm modal ──────────────────────────────────────────────────────
function LeaveConfirmModal({ crew, playerId, onClose, onLeft }: {
  crew: CrewDetail; playerId: string; onClose: () => void; onLeft: () => void;
}) {
  const { toast }       = useToast();
  const [loading, setL] = useState(false);
  const isOwner         = crew.members.find(m => m.playerId === playerId)?.role;
  const isCaptainRole   = isOwner === "captain" || isOwner === "owner";
  const otherMembers    = crew.members.filter(m => m.playerId !== playerId);
  const nextLeader      = [...crew.members]
    .filter(m => m.role === "member" && m.playerId !== playerId)
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())[0];

  let message = `Leave ${crew.name}? You'll need an invite to rejoin.`;
  if (isCaptainRole && otherMembers.length > 0)
    message = `Leave ${crew.name}? ${nextLeader?.displayName ?? "The longest-tenured member"} will become the new Owner.`;
  if (isCaptainRole && otherMembers.length === 0)
    message = `Leave and disband ${crew.name}? This cannot be undone.`;

  async function handleLeave() {
    setL(true);
    const res = await apiFetch(`/api/crews/${crew.id}/leave`, { method: "POST" });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setL(false);
    if (res.ok) onLeft();
    else toast({ title: d?.error ?? "Failed to leave.", variant: "destructive" });
  }

  return (
    <Modal onClose={onClose} title="LEAVE CLUB">
      <p className="text-sm mb-5" style={{ color: "rgba(240,184,41,0.7)" }}>{message}</p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 rounded-xl py-2.5 font-mono text-sm transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.05)", color: GOLD_DIM, border: "1px solid rgba(240,184,41,0.15)" }}>
          CANCEL
        </button>
        <button onClick={handleLeave} disabled={loading} data-testid="btn-confirm-leave"
          className="flex-1 rounded-xl py-2.5 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
          {loading ? "Leaving…" : "LEAVE"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Kick confirm modal ───────────────────────────────────────────────────────
function KickConfirmModal({ crew, target, onClose, onKicked }: {
  crew: CrewDetail; target: CrewMember; onClose: () => void; onKicked: () => void;
}) {
  const { toast }       = useToast();
  const [loading, setL] = useState(false);

  async function handleKick() {
    setL(true);
    const res = await apiFetch(`/api/crews/${crew.id}/kick`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: target.playerId }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setL(false);
    if (res.ok) onKicked();
    else toast({ title: d?.error ?? "Failed to kick.", variant: "destructive" });
  }

  return (
    <Modal onClose={onClose} title="KICK MEMBER">
      <p className="text-sm mb-5" style={{ color: "rgba(240,184,41,0.7)" }}>
        Kick {target.displayName} from {crew.name}? They can rejoin if you give them the invite code.
      </p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 rounded-xl py-2.5 font-mono text-sm transition-all active:scale-95"
          style={{ background: "rgba(255,255,255,0.05)", color: GOLD_DIM, border: "1px solid rgba(240,184,41,0.15)" }}>
          CANCEL
        </button>
        <button onClick={handleKick} disabled={loading} data-testid="btn-confirm-kick"
          className="flex-1 rounded-xl py-2.5 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
          {loading ? "Kicking…" : "KICK"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center"
         style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-2xl px-5 pt-5 pb-8"
           style={{ background: "rgba(16,12,6,0.98)", border: "1px solid rgba(240,184,41,0.20)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-mono font-bold tracking-widest text-sm" style={{ color: GOLD }}>{title}</h2>
          <button onClick={onClose} className="text-lg" style={{ color: GOLD_DIM }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
