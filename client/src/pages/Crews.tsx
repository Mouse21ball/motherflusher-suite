import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AuthModal } from "@/components/AuthModal";
import { apiFetch, getSessionToken } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CrewMember {
  id: string; playerId: string; displayName: string;
  avatarId: string | null; equippedFrameId: string | null;
  role: string; joinedAt: string; totalChipsWon: number;
}
interface CrewDetail {
  id: string; name: string; description: string | null;
  inviteCode: string; captainId: string; memberCount: number;
  createdAt: string; members: CrewMember[];
}
interface ChatMsg {
  id: string; playerId: string; playerName: string;
  avatarId: string | null; role: string; message: string; createdAt: string;
}

function getFrameSrc(equippedFrameId: string | null | undefined): string | null {
  if (!equippedFrameId) return null;
  return `/cosmetics/frames/${equippedFrameId.replace(/_/g, '-')}.png`;
}

// ─── Small avatar chip ────────────────────────────────────────────────────────
function AvatarChip({ name, size = 32, equippedFrameId }: { name: string; size?: number; equippedFrameId?: string | null }) {
  const colors = ["#c9541a","#1a6dc9","#1ac97a","#c9c21a","#c91a7a","#7a1ac9","#1ac9c9"];
  const color  = colors[name.charCodeAt(0) % colors.length];
  const initials = name.slice(0, 2).toUpperCase();
  const frameSrc = getFrameSrc(equippedFrameId);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div
        style={{ width: size, height: size, borderRadius: "50%", background: color,
                 display: "flex", alignItems: "center", justifyContent: "center",
                 fontSize: size * 0.36, fontWeight: 700, color: "#fff" }}
      >
        {initials}
      </div>
      {frameSrc && (
        <img
          src={frameSrc}
          alt="frame"
          style={{ position: 'absolute', inset: '-15%', width: '130%', height: '130%', pointerEvents: 'none', zIndex: 2 }}
        />
      )}
    </div>
  );
}

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
  const [tab, setTab]         = useState<"roster" | "chat" | "info">("roster");

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

  if (!me || !me.profileId) {
    return (
      <>
        <div
          className="min-h-screen flex flex-col"
          style={{
            backgroundImage: "url('/cosmetics/backgrounds/cosmetics-bg.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundAttachment: "fixed",
          }}
        >
          {/* Dark overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(5,4,10,0.82)" }} />

          {/* Header */}
          <div
            className="relative z-10 flex items-center px-4 py-4"
            style={{ borderBottom: "1px solid rgba(240,184,41,0.18)" }}
          >
            <button
              onClick={goBack}
              data-testid="btn-crews-back"
              className="flex items-center justify-center transition-all active:scale-90"
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "2px solid rgba(240,184,41,0.6)",
                background: "rgba(240,184,41,0.08)",
                color: "#f0b829",
                fontSize: 20,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ‹
            </button>
            <h1
              className="flex-1 text-center font-mono font-bold tracking-[0.22em] text-base"
              style={{ color: "#f0b829", textShadow: "0 0 18px rgba(240,184,41,0.4)" }}
            >
              CREWS
            </h1>
            {/* Spacer to balance the back button */}
            <div style={{ width: 40 }} />
          </div>

          {/* Body */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
            <p
              className="font-mono text-base"
              data-testid="crews-guest-message"
              style={{ color: "rgba(240,184,41,0.85)" }}
            >
              Sign in to access Crews.
            </p>

            {/* SIGN IN */}
            <button
              onClick={() => setShowAuthModal(true)}
              data-testid="btn-crews-sign-in"
              className="w-full max-w-xs font-mono font-bold tracking-widest transition-all active:scale-95"
              style={{
                background: "linear-gradient(135deg, #FFD700, #DAA520)",
                color: "#0a0805",
                padding: "14px 32px",
                borderRadius: 10,
                fontSize: 15,
                border: "none",
              }}
            >
              SIGN IN
            </button>

            {/* Back to Lobby */}
            <button
              onClick={() => navigate("/")}
              data-testid="btn-crews-lobby"
              className="w-full max-w-xs font-mono font-bold tracking-widest transition-all active:scale-95"
              style={{
                background: "transparent",
                color: "#f0b829",
                padding: "14px 32px",
                borderRadius: 10,
                fontSize: 15,
                border: "1.5px solid #f0b829",
              }}
            >
              Back to Lobby
            </button>
          </div>
        </div>

        {showAuthModal && (
          <AuthModal
            open={showAuthModal}
            defaultTab="login"
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => setShowAuthModal(false)}
          />
        )}
      </>
    );
  }

  if (crew === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: "#f0b829" }}>
        <p className="font-mono animate-pulse">Loading…</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-24"
      style={{
        position: "relative",
        backgroundImage: "url('/crews/crews-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Header — title image for NoCrew, crew name bar for InCrew */}
        {crew ? (
          <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3"
               style={{ background: "rgba(10,8,4,0.92)", borderBottom: "1px solid rgba(240,184,41,0.15)" }}>
            <button onClick={() => navigate("/")} className="text-amber-400 active:scale-90 transition-transform">←</button>
            <h1 className="font-mono text-lg font-bold tracking-widest" style={{ color: "#f0b829" }}>
              {crew.name.toUpperCase()}
            </h1>
            <span className="ml-auto text-xs font-mono" style={{ color: "rgba(240,184,41,0.5)" }}>
              {crew.memberCount}/25
            </span>
          </div>
        ) : (
          <div style={{ position: "relative", paddingTop: 12, paddingBottom: 4 }}>
            <button
              onClick={() => navigate("/")}
              style={{ position: "absolute", top: 14, left: 14, color: "#C9A227", fontSize: 22, lineHeight: 1, zIndex: 2 }}
              className="active:scale-90 transition-transform"
            >←</button>
            <div style={{ paddingLeft: 16, paddingRight: 16 }}>
              <img
                src="/crews/crews-title.png"
                alt="Crews"
                style={{ width: "100%", maxWidth: 320, display: "block" }}
              />
              <p className="font-mono uppercase text-[11px] leading-snug mt-2"
                 style={{ color: "rgba(255,255,255,0.70)" }}>
                CREWS ARE YOUR IN-GAME FAMILY. CHAT, CLIMB THE ROSTER, AND REP YOUR SET.
              </p>
            </div>
          </div>
        )}

        {crew === null ? (
          <NoCrew
            stripes={stripes}
            onCreate={() => setShowCreate(true)}
            onJoin={()  => setShowJoin(true)}
          />
        ) : (
          <InCrew
            crew={crew}
            playerId={playerId}
            tab={tab}
            onTabChange={setTab}
            onLeave={() => setLeaveTarget(crew)}
            onKick={setKickTarget}
            onReload={loadCrew}
          />
        )}

        {/* ── Modals ── */}
        {showCreate && (
          <CreateCrewModal
            stripes={stripes}
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); loadCrew(); toast({ title: "Crew created!" }); }}
          />
        )}
        {showJoin && (
          <JoinCrewModal
            stripes={stripes}
            onClose={() => setShowJoin(false)}
            onJoined={() => { setShowJoin(false); loadCrew(); toast({ title: "Joined the Crew!" }); }}
          />
        )}
        {leaveTarget && (
          <LeaveConfirmModal
            crew={leaveTarget}
            playerId={playerId}
            onClose={() => setLeaveTarget(null)}
            onLeft={() => { setLeaveTarget(null); setCrew(null); loadCrew(); }}
          />
        )}
        {kickTarget && crew && (
          <KickConfirmModal
            crew={crew}
            target={kickTarget}
            onClose={() => setKickTarget(null)}
            onKicked={() => { setKickTarget(null); loadCrew(); toast({ title: `${kickTarget.displayName} removed.` }); }}
          />
        )}
      </div>
    </div>
  );
}

// ─── No-crew state ────────────────────────────────────────────────────────────
function NoCrew({ stripes, onCreate, onJoin }: {
  stripes: number; onCreate: () => void; onJoin: () => void;
}) {
  const IMPACT: React.CSSProperties = {
    fontFamily: "'Impact', 'Anton', 'Arial Narrow', sans-serif",
    color: "#C9A227",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  const ChainDivider = () => (
    <div className="flex items-center gap-1 my-2">
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} style={{ width: 10, height: 5, borderRadius: 3, background: "rgba(201,162,39,0.55)", border: "1px solid rgba(201,162,39,0.35)" }} />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col w-full">

      {/* ── SECTION 1: CREATE A CREW ── */}
      <div className="flex items-stretch w-full" style={{ borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
        {/* Left: stacked icons */}
        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 150, minHeight: 170, position: "relative" }}>
          <img src="/crews/icon-crew.png" alt="" style={{ width: 130, height: 130, objectFit: "contain" }} />
          <img src="/crews/icon-crown.png" alt="" style={{ width: 85, height: 85, objectFit: "contain", position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)" }} />
        </div>
        {/* Right: text */}
        <div className="flex-1 py-5 pr-4" style={{ background: "rgba(0,0,0,0.35)" }}>
          {/* Title + price on same line */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ ...IMPACT, fontSize: 26, fontWeight: 900 }}>CREATE A CREW</span>
            <span style={{ ...IMPACT, fontSize: 22, fontWeight: 900, flexShrink: 0 }}>500◆</span>
          </div>
          <ChainDivider />
          <p className="font-mono uppercase text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.75)" }}>
            START YOUR OWN CREW AND INVITE UP TO 24 MEMBERS.
          </p>
          {stripes < 500 ? (
            <button
              onClick={() => window.location.href = "/shop"}
              className="mt-2 font-mono uppercase text-[10px] underline tracking-wide"
              style={{ color: "#ef4444" }}
            >
              NEED 500 STRIPES — VISIT THE SHOP
            </button>
          ) : (
            <button
              onClick={onCreate}
              data-testid="btn-create-crew"
              className="mt-3 font-mono uppercase text-xs font-bold tracking-widest px-4 py-2 rounded-lg transition-all active:scale-95"
              style={{ background: "rgba(201,162,39,0.20)", border: "1px solid rgba(201,162,39,0.50)", color: "#C9A227" }}
            >
              CREATE CREW →
            </button>
          )}
        </div>
      </div>

      {/* ── SECTION 2: JOIN A CREW ── */}
      <div className="flex items-stretch w-full" style={{ borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
        {/* Left: icon */}
        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 150, minHeight: 150 }}>
          <img src="/crews/icon-lock.png" alt="" style={{ width: 130, height: 130, objectFit: "contain" }} />
        </div>
        {/* Right: text */}
        <div className="flex-1 py-5 pr-4" style={{ background: "rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ ...IMPACT, fontSize: 26, fontWeight: 900 }}>JOIN A CREW</span>
            <span style={{ ...IMPACT, fontSize: 22, fontWeight: 900, flexShrink: 0 }}>50◆</span>
          </div>
          <ChainDivider />
          <p className="font-mono uppercase text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.75)" }}>
            ENTER A 6-CHARACTER INVITE CODE TO JOIN.
          </p>
          {stripes < 50 && (
            <button
              onClick={() => window.location.href = "/shop"}
              className="mt-2 font-mono uppercase text-[10px] underline tracking-wide"
              style={{ color: "#ef4444" }}
            >
              NEED 50 STRIPES — VISIT THE SHOP
            </button>
          )}
        </div>
      </div>

      {/* ── SECTION 3: JOIN WITH CODE ── */}
      <button
        onClick={onJoin}
        data-testid="btn-join-crew"
        className="flex items-stretch w-full transition-all active:scale-[0.98]"
      >
        {/* Left: icon */}
        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 150, minHeight: 140 }}>
          <img src="/crews/icon-code.png" alt="" style={{ width: 130, height: 130, objectFit: "contain" }} />
        </div>
        {/* Right: text */}
        <div className="flex-1 py-5 pr-4 text-left" style={{ background: "rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...IMPACT, fontSize: 26, fontWeight: 900 }}>JOIN WITH CODE</span>
            <span style={{ color: "#C9A227", fontSize: 22 }}>›</span>
          </div>
          <div style={{ marginTop: 6, height: 2, width: 140, background: "linear-gradient(90deg, #C9A227 0%, rgba(201,162,39,0) 100%)", borderRadius: 1 }} />
        </div>
      </button>

    </div>
  );
}

// ─── In-crew state ────────────────────────────────────────────────────────────
function InCrew({ crew, playerId, tab, onTabChange, onLeave, onKick, onReload }: {
  crew: CrewDetail; playerId: string; tab: "roster" | "chat" | "info";
  onTabChange: (t: "roster" | "chat" | "info") => void;
  onLeave: () => void; onKick: (m: CrewMember) => void; onReload: () => void;
}) {
  const { toast } = useToast();
  const isCaptain = crew.captainId === playerId;

  function copyInvite() {
    navigator.clipboard.writeText(crew.inviteCode).then(
      () => toast({ title: "Invite code copied!" }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  }

  const TABS: Array<{ key: "roster" | "chat" | "info"; label: string }> = [
    { key: "roster", label: "ROSTER" },
    { key: "chat",   label: "CHAT"   },
    { key: "info",   label: "INFO"   },
  ];

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      {/* Invite code bar */}
      <div className="flex items-center justify-between px-4 py-2.5"
           style={{ borderBottom: "1px solid rgba(240,184,41,0.10)" }}>
        <span className="text-xs font-mono" style={{ color: "rgba(240,184,41,0.5)" }}>Invite code</span>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold tracking-[0.3em] text-sm" style={{ color: "#f0b829" }} data-testid="crew-invite-code">
            {crew.inviteCode}
          </span>
          <button onClick={copyInvite} data-testid="btn-copy-invite"
                  className="text-xs px-2 py-0.5 rounded font-mono transition-all active:scale-90"
                  style={{ background: "rgba(240,184,41,0.12)", color: "#f0b829", border: "1px solid rgba(240,184,41,0.25)" }}>
            COPY
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="grid grid-cols-3" style={{ borderBottom: "1px solid rgba(240,184,41,0.15)" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => onTabChange(t.key)}
                  data-testid={`tab-crew-${t.key}`}
                  className="py-2.5 font-mono text-xs tracking-wider transition-colors"
                  style={{
                    color: tab === t.key ? "#f0b829" : "rgba(240,184,41,0.4)",
                    borderBottom: tab === t.key ? "2px solid #f0b829" : "2px solid transparent",
                  }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "roster" && (
        <RosterTab crew={crew} playerId={playerId} isCaptain={isCaptain} onKick={onKick} />
      )}
      {tab === "chat" && (
        <ChatTab crew={crew} playerId={playerId} onReload={onReload} />
      )}
      {tab === "info" && (
        <InfoTab crew={crew} playerId={playerId} isCaptain={isCaptain} onLeave={onLeave} onReload={onReload} />
      )}
    </div>
  );
}

// ─── Roster tab ───────────────────────────────────────────────────────────────
function RosterTab({ crew, playerId, isCaptain, onKick }: {
  crew: CrewDetail; playerId: string; isCaptain: boolean; onKick: (m: CrewMember) => void;
}) {
  const sorted = [...crew.members].sort((a, b) => b.totalChipsWon - a.totalChipsWon);
  return (
    <div className="flex flex-col gap-1 px-4 pt-3">
      {sorted.map((m, i) => (
        <div key={m.id} data-testid={`roster-row-${m.playerId}`}
             className="flex items-center gap-3 rounded-xl px-3 py-2.5"
             style={{ background: "rgba(240,184,41,0.04)", border: "1px solid rgba(240,184,41,0.08)" }}>
          <span className="font-mono text-xs w-5 text-right" style={{ color: "rgba(240,184,41,0.35)" }}>
            #{i + 1}
          </span>
          <AvatarChip name={m.displayName} size={32} equippedFrameId={m.equippedFrameId} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm truncate" style={{ color: "#f0b829" }}>{m.displayName}</span>
              {m.role === "captain" && (
                <span className="text-[9px] font-mono px-1 rounded" style={{ background: "rgba(240,184,41,0.2)", color: "#f0b829" }}>
                  CAPTAIN
                </span>
              )}
              {m.playerId === playerId && m.role !== "captain" && (
                <span className="text-[9px] font-mono px-1 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(240,184,41,0.5)" }}>
                  YOU
                </span>
              )}
            </div>
            <p className="text-xs font-mono mt-0.5" style={{ color: "rgba(240,184,41,0.4)" }}>
              {m.totalChipsWon.toLocaleString()} chips won
            </p>
          </div>
          {isCaptain && m.role !== "captain" && (
            <button onClick={() => onKick(m)} data-testid={`btn-kick-${m.playerId}`}
                    className="text-xs px-2 py-1 rounded font-mono transition-all active:scale-90"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
              Kick
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Chat tab ─────────────────────────────────────────────────────────────────
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
        const all = [...prev, ...newOnes].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return all.slice(-200);
      });
    }
  }, [crew.id]);

  useEffect(() => {
    fetchMsgs();
    pollRef.current = setInterval(fetchMsgs, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMsgs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportedId:  crewReportTarget.pid,
          reason:      crewReportReason,
          context:     crewReportTarget.msgId,
          contextType: 'crew_chat',
          notes:       crewReportNotes.trim() || undefined,
        }),
      });
      const d = await res.json().catch(() => ({} as { error?: string }));
      if (res.ok) toast({ title: 'Report submitted. Our team will review it.' });
      else toast({ title: d?.error ?? 'Could not submit report.', variant: 'destructive' });
    } catch { toast({ title: 'Network error.', variant: 'destructive' }); }
    finally {
      setCrewReporting(false); setCrewReportTarget(null);
      setCrewReportReason('harassment'); setCrewReportNotes('');
    }
  }

  async function send() {
    if (!text.trim() || sending) return;
    setSend(true);
    const res = await apiFetch(`/api/crews/${crew.id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text.trim() }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setSend(false);
    if (res.ok) {
      setText("");
      fetchMsgs();
    } else if (res.status === 422) {
      toast({ title: "Message blocked — please keep it clean.", variant: "destructive" });
    } else if (res.status === 429) {
      toast({ title: "Slow down — too many messages.", variant: "destructive" });
    } else {
      toast({ title: d?.error ?? "Failed to send.", variant: "destructive" });
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") send();
  }

  const memberRole = (pid: string) =>
    crew.members.find(m => m.playerId === pid)?.role ?? "member";

  return (
    <>
      {crewMenu && (
        <div
          className="fixed z-[200] rounded-xl shadow-2xl py-1 border min-w-[160px]"
          style={{ top: crewMenu.y, left: Math.min(crewMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 400) - 180), background: '#1a1a1f', borderColor: 'rgba(255,255,255,0.08)' }}
          onClick={e => e.stopPropagation()}
          data-testid="crew-chat-context-menu"
        >
          <button
            className="w-full text-left px-4 py-2.5 text-xs font-mono"
            style={{ color: 'rgba(220,80,80,0.80)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { setCrewBlockTarget({ name: crewMenu.name, pid: crewMenu.pid }); setCrewMenu(null); }}
            data-testid="crew-chat-menu-block"
          >
            Block {crewMenu.name}
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-xs font-mono"
            style={{ color: 'rgba(201,162,39,0.80)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { setCrewReportTarget({ name: crewMenu.name, pid: crewMenu.pid, msgId: crewMenu.msgId }); setCrewMenu(null); }}
            data-testid="crew-chat-menu-report"
          >
            Report {crewMenu.name}
          </button>
        </div>
      )}
      {crewBlockTarget && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.60)' }}
          onClick={() => setCrewBlockTarget(null)}
          data-testid="crew-block-confirm-overlay"
        >
          <div
            className="w-full max-w-xs rounded-2xl p-5 space-y-4"
            style={{ background: '#17171c', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={e => e.stopPropagation()}
            data-testid="crew-block-confirm-modal"
          >
            <div>
              <div className="text-sm font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.85)' }}>Block {crewBlockTarget.name}?</div>
              <p className="text-xs font-mono leading-relaxed" style={{ color: 'rgba(255,255,255,0.40)' }}>
                You won't see their messages. You can unblock them in Settings.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest transition-all active:scale-[0.97]"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.40)' }}
                onClick={() => setCrewBlockTarget(null)}
                data-testid="crew-block-confirm-cancel"
              >
                Cancel
              </button>
              <button
                className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest transition-all active:scale-[0.97] disabled:opacity-50"
                style={{ background: 'rgba(220,80,80,0.20)', color: 'rgba(220,80,80,0.90)' }}
                onClick={confirmCrewBlock}
                disabled={crewBlocking}
                data-testid="crew-block-confirm-submit"
              >
                {crewBlocking ? 'Blocking…' : 'Block'}
              </button>
            </div>
          </div>
        </div>
      )}
      {crewReportTarget && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.60)' }}
          onClick={() => { setCrewReportTarget(null); setCrewReportReason('harassment'); setCrewReportNotes(''); }}
          data-testid="crew-report-modal-overlay"
        >
          <div
            className="w-full max-w-xs rounded-2xl p-5 space-y-4"
            style={{ background: '#17171c', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={e => e.stopPropagation()}
            data-testid="crew-report-modal"
          >
            <div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>Report {crewReportTarget.name}</div>
              <p className="text-xs font-mono leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Our team reviews all reports. False reports may result in account action.
              </p>
            </div>
            <div>
              <label className="block mb-1.5 text-[9px] font-mono uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.30)' }}>Reason</label>
              <select
                value={crewReportReason}
                onChange={e => setCrewReportReason(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm font-mono border focus:outline-none"
                style={{ background: 'rgba(0,0,0,0.40)', color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.08)' }}
                data-testid="crew-report-reason-select"
              >
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
              <textarea
                value={crewReportNotes}
                onChange={e => setCrewReportNotes(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Additional details…"
                className="w-full rounded-xl px-3 py-2 text-sm font-mono border focus:outline-none resize-none"
                style={{ background: 'rgba(0,0,0,0.40)', color: 'rgba(255,255,255,0.65)', borderColor: 'rgba(255,255,255,0.08)' }}
                data-testid="crew-report-notes-textarea"
              />
              <div className="text-right text-[9px] font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.20)' }} data-testid="crew-report-notes-counter">
                {crewReportNotes.length}/500
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest transition-all active:scale-[0.97]"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.40)' }}
                onClick={() => { setCrewReportTarget(null); setCrewReportReason('harassment'); setCrewReportNotes(''); }}
                data-testid="crew-report-cancel"
              >Cancel</button>
              <button
                className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest transition-all active:scale-[0.97] disabled:opacity-50"
                style={{ background: 'rgba(201,162,39,0.20)', color: 'rgba(201,162,39,0.90)' }}
                onClick={submitCrewReport}
                disabled={crewReporting}
                data-testid="crew-report-submit"
              >{crewReporting ? 'Sending…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col" style={{ height: "calc(100vh - 230px)" }}>
      {/* Message feed */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {msgs.length === 0 && (
          <p className="text-center text-xs font-mono pt-8" style={{ color: "rgba(240,184,41,0.3)" }}>
            No messages yet. Say something.
          </p>
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
                  <span className="text-[10px] font-mono" style={{ color: "rgba(240,184,41,0.5)" }}>
                    {m.playerName}
                  </span>
                  {role === "captain" && (
                    <span className="text-[8px] font-mono px-0.5 rounded" style={{ background: "rgba(240,184,41,0.15)", color: "#f0b829" }}>
                      CAPTAIN
                    </span>
                  )}
                </div>
                <div className="rounded-xl px-3 py-1.5 text-xs font-mono break-words select-none"
                     style={{
                       background: isMe ? "rgba(240,184,41,0.18)" : "rgba(255,255,255,0.06)",
                       color: isMe ? "#f0b829" : "rgba(240,184,41,0.8)",
                       border: "1px solid rgba(240,184,41,0.10)",
                     }}
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

      {/* Input bar */}
      <div className="px-4 pb-3 flex gap-2" style={{ borderTop: "1px solid rgba(240,184,41,0.10)" }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          maxLength={500}
          placeholder="Say something…"
          data-testid="input-crew-chat"
          className="flex-1 rounded-xl px-3 py-2 text-sm font-mono outline-none"
          style={{
            background: "rgba(240,184,41,0.07)",
            border: "1px solid rgba(240,184,41,0.2)",
            color: "#f0b829",
          }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          data-testid="btn-send-chat"
          className="rounded-xl px-4 py-2 font-mono text-xs font-bold transition-all active:scale-90 disabled:opacity-40"
          style={{ background: "rgba(240,184,41,0.2)", color: "#f0b829", border: "1px solid rgba(240,184,41,0.4)" }}
        >
          SEND
        </button>
      </div>
    </div>
    </>
  );
}

// ─── Info tab ─────────────────────────────────────────────────────────────────
function InfoTab({ crew, playerId, isCaptain, onLeave, onReload }: {
  crew: CrewDetail; playerId: string; isCaptain: boolean;
  onLeave: () => void; onReload: () => void;
}) {
  const { toast }                 = useToast();
  const [editName, setEditName]   = useState(crew.name);
  const [editDesc, setEditDesc]   = useState(crew.description ?? "");
  const [saving, setSaving]       = useState(false);
  const [regen, setRegen]         = useState(false);

  async function handleRename() {
    if (!editName.trim()) return;
    setSaving(true);
    const res = await apiFetch(`/api/crews/${crew.id}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setSaving(false);
    if (res.ok) { onReload(); toast({ title: "Crew updated." }); }
    else         toast({ title: d?.error ?? "Failed to rename.", variant: "destructive" });
  }

  async function handleRegenInvite() {
    setRegen(true);
    const res = await apiFetch(`/api/crews/${crew.id}/regenerate-invite`, { method: "POST" });
    const d = await res.json().catch(() => ({} as { inviteCode?: string; error?: string }));
    setRegen(false);
    if (res.ok) { onReload(); toast({ title: `New code: ${d.inviteCode}` }); }
    else         toast({ title: d?.error ?? "Failed.", variant: "destructive" });
  }

  const memberCount = crew.memberCount;
  const nextCaptain = [...crew.members]
    .filter(m => m.role === "member")
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())[0];

  return (
    <div className="flex flex-col gap-4 px-4 pt-4">
      {/* Crew description */}
      <div className="rounded-xl p-4" style={{ background: "rgba(240,184,41,0.04)", border: "1px solid rgba(240,184,41,0.10)" }}>
        <p className="text-xs font-mono mb-1" style={{ color: "rgba(240,184,41,0.45)" }}>DESCRIPTION</p>
        <p className="text-sm" style={{ color: "rgba(240,184,41,0.7)" }}>
          {crew.description || <em style={{ color: "rgba(240,184,41,0.3)" }}>No description set.</em>}
        </p>
      </div>

      <div className="rounded-xl p-4" style={{ background: "rgba(240,184,41,0.04)", border: "1px solid rgba(240,184,41,0.10)" }}>
        <p className="text-xs font-mono mb-1" style={{ color: "rgba(240,184,41,0.45)" }}>FOUNDED</p>
        <p className="text-sm font-mono" style={{ color: "rgba(240,184,41,0.7)" }}>
          {new Date(crew.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Captain controls */}
      {isCaptain && (
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(240,184,41,0.05)", border: "1px solid rgba(240,184,41,0.18)" }}>
          <p className="font-mono text-xs font-bold tracking-wider" style={{ color: "#f0b829" }}>CAPTAIN CONTROLS</p>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono" style={{ color: "rgba(240,184,41,0.5)" }}>Crew name</label>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              maxLength={30}
              data-testid="input-rename-crew"
              className="rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: "#f0b829" }}
            />
            <label className="text-xs font-mono" style={{ color: "rgba(240,184,41,0.5)" }}>Description (optional)</label>
            <textarea
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              maxLength={200}
              rows={3}
              data-testid="input-crew-description"
              className="rounded-lg px-3 py-2 text-sm font-mono outline-none resize-none"
              style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: "#f0b829" }}
            />
            <button
              onClick={handleRename}
              disabled={saving || editName.trim().length < 3}
              data-testid="btn-save-crew-info"
              className="rounded-lg py-2 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
              style={{ background: "rgba(240,184,41,0.15)", color: "#f0b829", border: "1px solid rgba(240,184,41,0.35)" }}
            >
              {saving ? "Saving…" : "SAVE CHANGES"}
            </button>
          </div>

          <button
            onClick={handleRegenInvite}
            disabled={regen}
            data-testid="btn-regen-invite"
            className="rounded-lg py-2 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
            style={{ background: "rgba(240,184,41,0.07)", color: "#f0b829", border: "1px solid rgba(240,184,41,0.2)" }}
          >
            {regen ? "Generating…" : "↺ REGENERATE INVITE CODE"}
          </button>

          <p className="text-xs" style={{ color: "rgba(240,184,41,0.35)" }}>
            {memberCount > 1
              ? `Leaving will promote ${nextCaptain?.displayName ?? "the next member"} to Captain.`
              : "Leaving will permanently disband this Crew."}
          </p>
        </div>
      )}

      {/* Leave button */}
      <button
        onClick={onLeave}
        data-testid="btn-leave-crew"
        className="w-full rounded-xl py-3 font-mono text-sm font-bold tracking-wider transition-all active:scale-95"
        style={{ background: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
      >
        LEAVE CREW
      </button>
    </div>
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

  const nameErr = name.trim().length > 0 && (name.trim().length < 3 ? "Min 3 chars" : name.trim().length > 30 ? "Max 30 chars" : null);
  const canCreate = name.trim().length >= 3 && name.trim().length <= 30 && stripes >= 500;

  async function handleCreate() {
    if (!canCreate) return;
    setLoading(true);
    const res = await apiFetch("/api/crews/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: desc.trim() || undefined }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setLoading(false);
    if (res.ok)        onCreated();
    else if (d?.error) toast({ title: d.error, variant: "destructive" });
    else               toast({ title: "Failed to create Crew.", variant: "destructive" });
  }

  return (
    <Modal onClose={onClose} title="CREATE A CREW">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-mono" style={{ color: "rgba(240,184,41,0.5)" }}>Crew name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={30}
            placeholder="3–30 characters"
            data-testid="input-crew-name"
            className="w-full rounded-lg px-3 py-2 mt-1 text-sm font-mono outline-none"
            style={{ background: "rgba(240,184,41,0.07)", border: `1px solid ${nameErr ? "#ef4444" : "rgba(240,184,41,0.2)"}`, color: "#f0b829" }}
          />
          {nameErr && <p className="text-xs mt-0.5" style={{ color: "#ef4444" }}>{nameErr}</p>}
        </div>
        <div>
          <label className="text-xs font-mono" style={{ color: "rgba(240,184,41,0.5)" }}>Description (optional)</label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="What's your Crew about?"
            data-testid="input-create-crew-desc"
            className="w-full rounded-lg px-3 py-2 mt-1 text-sm font-mono outline-none resize-none"
            style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: "#f0b829" }}
          />
        </div>
        <div className="flex justify-between items-center text-xs font-mono" style={{ color: "#C9A227" }}>
          <span>Your balance: {stripes.toLocaleString()}◆</span>
          <span>Cost: 500◆</span>
        </div>
        {canCreate && (
          <p className="text-xs font-mono text-center" style={{ color: "rgba(240,184,41,0.45)" }}>
            Create "{name.trim()}" for 500 Stripes?
          </p>
        )}
        <button
          onClick={handleCreate}
          disabled={!canCreate || loading}
          data-testid="btn-confirm-create-crew"
          className="w-full rounded-xl py-3 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "rgba(201,162,39,0.20)", color: "#C9A227", border: "1px solid rgba(201,162,39,0.5)" }}
        >
          {loading ? "Creating…" : "CREATE FOR 500◆"}
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
    else        setPreview(null);
  }

  function handleCode(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.toUpperCase().slice(0, 6);
    setCode(v);
    fetchPreview(v);
  }

  async function handleJoin() {
    setLoading(true);
    const res = await apiFetch("/api/crews/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: code }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setLoading(false);
    if (res.ok)        onJoined();
    else if (d?.error) toast({ title: d.error, variant: "destructive" });
    else               toast({ title: "Failed to join Crew.", variant: "destructive" });
  }

  const canJoin = code.length === 6 && !!preview && preview.memberCount < 25 && stripes >= 50;

  return (
    <Modal onClose={onClose} title="JOIN A CREW">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-mono" style={{ color: "rgba(240,184,41,0.5)" }}>Enter invite code</label>
          <input
            value={code}
            onChange={handleCode}
            maxLength={6}
            placeholder="XXXXXX"
            data-testid="input-invite-code"
            className="w-full rounded-lg px-3 py-2 mt-1 text-xl font-mono tracking-[0.4em] outline-none text-center"
            style={{ background: "rgba(240,184,41,0.07)", border: "1px solid rgba(240,184,41,0.2)", color: "#f0b829" }}
          />
        </div>
        {previewing && <p className="text-xs text-center font-mono" style={{ color: "rgba(240,184,41,0.4)" }}>Looking up…</p>}
        {preview && (
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(240,184,41,0.08)", border: "1px solid rgba(240,184,41,0.2)" }}>
            <p className="font-mono font-bold" style={{ color: "#f0b829" }}>{preview.name}</p>
            <p className="text-xs mt-1 font-mono" style={{ color: "rgba(240,184,41,0.5)" }}>{preview.memberCount}/25 members</p>
            {preview.memberCount >= 25 && (
              <p className="text-xs mt-1" style={{ color: "#ef4444" }}>This Crew is full.</p>
            )}
          </div>
        )}
        <div className="flex justify-between items-center text-xs font-mono" style={{ color: "#C9A227" }}>
          <span>Your balance: {stripes.toLocaleString()}◆</span>
          <span>Cost: 50◆</span>
        </div>
        <button
          onClick={handleJoin}
          disabled={!canJoin || loading}
          data-testid="btn-confirm-join-crew"
          className="w-full rounded-xl py-3 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "rgba(201,162,39,0.15)", color: "#C9A227", border: "1px solid rgba(201,162,39,0.35)" }}
        >
          {loading ? "Joining…" : `JOIN FOR 50◆`}
        </button>
      </div>
    </Modal>
  );
}

// ─── Leave confirm modal ──────────────────────────────────────────────────────
function LeaveConfirmModal({ crew, playerId, onClose, onLeft }: {
  crew: CrewDetail; playerId: string; onClose: () => void; onLeft: () => void;
}) {
  const { toast }         = useToast();
  const [loading, setL]   = useState(false);
  const isCaptain         = crew.captainId === playerId;
  const otherMembers      = crew.members.filter(m => m.playerId !== playerId);
  const nextCaptain       = [...crew.members]
    .filter(m => m.role === "member")
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())[0];

  let message = `Leave ${crew.name}? You'll need an invite to rejoin and the 50 Stripes cost still applies.`;
  if (isCaptain && otherMembers.length > 0)
    message = `Leave ${crew.name}? ${nextCaptain?.displayName ?? "The longest-tenured member"} will become the new Captain.`;
  if (isCaptain && otherMembers.length === 0)
    message = `Leave and disband ${crew.name}? This cannot be undone.`;

  async function handleLeave() {
    setL(true);
    const res = await apiFetch(`/api/crews/${crew.id}/leave`, { method: "POST" });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setL(false);
    if (res.ok) onLeft();
    else        toast({ title: d?.error ?? "Failed to leave.", variant: "destructive" });
  }

  return (
    <Modal onClose={onClose} title="LEAVE CREW">
      <p className="text-sm mb-5" style={{ color: "rgba(240,184,41,0.7)" }}>{message}</p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 rounded-xl py-2.5 font-mono text-sm transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(240,184,41,0.6)", border: "1px solid rgba(240,184,41,0.15)" }}>
          CANCEL
        </button>
        <button
          onClick={handleLeave}
          disabled={loading}
          data-testid="btn-confirm-leave"
          className="flex-1 rounded-xl py-2.5 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
        >
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: target.playerId }),
    });
    const d = await res.json().catch(() => ({} as { error?: string }));
    setL(false);
    if (res.ok) onKicked();
    else        toast({ title: d?.error ?? "Failed to kick.", variant: "destructive" });
  }

  return (
    <Modal onClose={onClose} title="KICK MEMBER">
      <p className="text-sm mb-5" style={{ color: "rgba(240,184,41,0.7)" }}>
        Kick {target.displayName} from {crew.name}? They can rejoin if you give them the invite code.
      </p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 rounded-xl py-2.5 font-mono text-sm transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(240,184,41,0.6)", border: "1px solid rgba(240,184,41,0.15)" }}>
          CANCEL
        </button>
        <button
          onClick={handleKick}
          disabled={loading}
          data-testid="btn-confirm-kick"
          className="flex-1 rounded-xl py-2.5 font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
        >
          {loading ? "Kicking…" : "KICK"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Generic modal shell ──────────────────────────────────────────────────────
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center"
         style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-2xl px-5 pt-5 pb-8"
           style={{ background: "rgba(16,12,6,0.98)", border: "1px solid rgba(240,184,41,0.20)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-mono font-bold tracking-widest text-sm" style={{ color: "#f0b829" }}>{title}</h2>
          <button onClick={onClose} className="text-lg" style={{ color: "rgba(240,184,41,0.5)" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
