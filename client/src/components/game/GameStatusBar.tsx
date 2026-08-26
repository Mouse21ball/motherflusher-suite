import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Menu, Camera, Home, BookOpen, MessageSquare } from "lucide-react";
import { HowToPlay } from "@/components/ui/HowToPlay";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { HandHistory } from "./HandHistory";
import { StatsView } from "./StatsView";
import { DeckSelector } from "./DeckSelector";
import { MODE_INFO } from "./GameHeader";
import type { GameSessionStats } from "./GameHeader";
import type { GameState, GamePhase } from "@/lib/poker/types";
import { shareOrigin } from "@/lib/apiConfig";

const MID_HAND: Set<string> = new Set([
  'ANTE','DEAL','DRAW','DRAW_1','DRAW_2','DRAW_3',
  'BET_1','BET_2','BET_3','BET_4','BET_5','BET_6','BET_7','BET_8',
  'HIT_1','HIT_2','HIT_3','HIT_4','HIT_5','HIT_6','HIT_7','HIT_8',
  'DECLARE','DECLARE_AND_BET',
  'REVEAL_TOP_ROW','REVEAL_SECOND_ROW','REVEAL_LOWER_CENTER','REVEAL_FACTOR_CARD',
]);

interface GameStatusBarProps {
  modeId: string;
  gameState: GameState;
  chips: number;
  stripes?: number;
  phase: GamePhase;
  onForfeit?: () => void;
  sessionStats?: GameSessionStats;
  tableId?: string;
  humanCount?: number;
  onOpenChat?: () => void;
  chatUnread?: number;
}

function PillGroup({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-xs uppercase tracking-wider text-white/60 font-mono leading-none">{label}</span>
      <span className={`text-xs font-mono text-white leading-none font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

const HTP_MODE_ID: Record<string, 'badugi' | 'dead7' | '1535' | 'suits'> = {
  badugi: 'badugi', dead7: 'dead7', fifteen35: '1535', suitspoker: 'suits',
};

export function GameStatusBar({ modeId, gameState, chips, stripes, phase, onForfeit, sessionStats, tableId, humanCount = 1, onOpenChat, chatUnread = 0 }: GameStatusBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [, navigate] = useLocation();
  const htpModeId = HTP_MODE_ID[modeId];

  const modeInfo = MODE_INFO[modeId];
  const isMidHand = MID_HAND.has(phase);
  const activePlayers = gameState.players.filter(p => p.presence !== 'reserved').length;
  const pot = gameState.pot;
  const ante = gameState.minBet;

  const inviteUrl = useMemo(() => tableId ? `${shareOrigin()}/${modeId}?t=${tableId}` : '', [tableId, modeId]);

  const handleLobby = () => {
    if (isMidHand) { setExitDialogOpen(true); setMenuOpen(false); }
    else { navigate('/'); }
  };

  const handleConfirmExit = () => {
    if (onForfeit) onForfeit();
    setExitDialogOpen(false);
    navigate('/');
  };

  const handleCopy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 h-12 sm:h-14 bg-black/70 backdrop-blur-md border-b border-white/10 px-3 flex items-center justify-between gap-3">
        {/* Left — hamburger */}
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="w-9 h-9 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white/70 hover:text-white active:scale-95 transition-all touch-manipulation shrink-0"
          data-testid="button-menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Center — info pills */}
        <div className="flex items-center gap-4 flex-1 justify-center">
          <PillGroup label="ANTES" value={`$${ante}`} />
          <PillGroup label="PLAYERS" value={`${activePlayers} / 5`} />
          <PillGroup label="POT" value={`$${pot}`} valueClass="text-sm font-bold text-[#C9A227]" />
        </div>

        {/* Right — stripes + chat + snapshot */}
        <div className="flex items-center gap-1.5 shrink-0">
          {stripes !== undefined && (
            <div
              className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg shrink-0"
              style={{ background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.22)' }}
              data-testid="display-stripes-topbar"
            >
              <img src="/stripes-icon.png" alt="" aria-hidden="true" style={{ width: 12, height: 12 }} />
              <span className="text-xs font-mono tabular-nums leading-none" style={{ color: '#a855f7' }}>
                {stripes.toLocaleString()}
              </span>
            </div>
          )}
          {onOpenChat && (
            <button
              onClick={onOpenChat}
              aria-label="Open chat"
              className="relative w-9 h-9 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white/70 hover:text-white active:scale-95 transition-all touch-manipulation"
              data-testid="button-open-chat"
            >
              <MessageSquare className="w-4 h-4" />
              {chatUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#C9A227] text-[#0B0B0D] text-xs font-bold flex items-center justify-center leading-none pointer-events-none">
                  {chatUnread > 9 ? '9+' : chatUnread}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => console.log('TODO: snapshot feature')}
            aria-label="Snapshot"
            className="w-9 h-9 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white/70 hover:text-white active:scale-95 transition-all touch-manipulation"
            data-testid="button-snapshot"
          >
            <Camera className="w-4 h-4" />
          </button>
          {htpModeId && (
            <button
              onClick={() => setShowHelp(true)}
              aria-label="How to Play"
              data-testid="button-how-to-play-ingame"
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white', fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              ?
            </button>
          )}
        </div>
      </header>
      {showHelp && htpModeId && (
        <HowToPlay modeId={htpModeId} onClose={() => setShowHelp(false)} />
      )}

      {/* Hamburger drawer */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[300px] sm:w-[340px] bg-[#0B0B0D] border-white/[0.04] p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Game Menu</SheetTitle>
          <ScrollArea className="h-full">
            <div className="p-5 pt-8 flex flex-col gap-5">

              {/* Mode identity */}
              {modeInfo && (
                <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
                  <div className={`w-9 h-9 rounded-lg bg-white/[0.03] flex items-center justify-center ${modeInfo.accentClass} font-bold font-mono text-xs border ${modeInfo.borderClass} shrink-0`}>
                    {modeInfo.abbrev}
                  </div>
                  <div className="flex flex-col gap-0">
                    <span className="font-semibold text-white/80 text-sm">{modeInfo.name}</span>
                    {tableId && <span className="text-xs font-mono text-white/60 tracking-widest">{tableId}</span>}
                  </div>
                </div>
              )}

              {/* Chip stack + session + stripes */}
              <div className="flex flex-col gap-0.5 pb-4 border-b border-white/[0.06]">
                <span className="text-xs font-mono uppercase tracking-widest text-white/60">Your Stack</span>
                <span className="text-xl font-mono font-bold text-[#C9A227] tabular-nums">${chips.toLocaleString()}</span>
                {sessionStats && (
                  <span className={`text-xs font-mono font-semibold tabular-nums ${sessionStats.netProfit >= 0 ? 'text-emerald-400/70' : 'text-red-400/65'}`}>
                    {sessionStats.netProfit >= 0 ? '+' : ''}${sessionStats.netProfit} this session
                  </span>
                )}
                {stripes !== undefined && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2" style={{ borderTop: '1px solid rgba(168,85,247,0.12)' }}>
                    <img src="/stripes-icon.png" alt="" aria-hidden="true" style={{ width: 13, height: 13 }} />
                    <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'rgba(168,85,247,0.65)' }}>Stripes</span>
                    <span className="text-sm font-mono font-semibold tabular-nums ml-auto" style={{ color: '#a855f7' }}>
                      {stripes.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Invite link */}
              {tableId && inviteUrl && (
                <div className="pb-4 border-b border-white/[0.06]">
                  <div className="text-xs font-mono uppercase tracking-widest text-white/60 mb-2">Invite Friends</div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white/75 text-sm tracking-widest flex-1">{tableId}</span>
                    <button
                      onClick={handleCopy}
                      className={`text-xs font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${
                        copied ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : 'text-white/60 border-white/[0.10] hover:text-white/60'
                      }`}
                    >
                      {copied ? '✓ Copied' : 'Copy Link'}
                    </button>
                  </div>
                  {humanCount >= 2 && (
                    <span className="text-xs font-mono text-emerald-400/65 mt-1 block">{humanCount} players at this table</span>
                  )}
                </div>
              )}

              {/* Rules */}
              {modeInfo && (
                <div className="pb-4 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-400/60" />
                    <span className="text-xs font-mono uppercase tracking-widest text-emerald-400/70">How to Play</span>
                  </div>
                  <div className="space-y-4">
                    {modeInfo.rules.map((section, i) => (
                      <div key={i}>
                        <h3 className={`text-xs font-mono uppercase tracking-[0.2em] ${modeInfo.accentClass} mb-1.5 font-bold`}>{section.heading}</h3>
                        <ul className="space-y-1.5">
                          {section.items.map((item, j) => (
                            <li key={j} className="text-xs text-white/60 leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[8px] before:w-1 before:h-1 before:rounded-full before:bg-white/10">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sub-components */}
              <div className="flex flex-wrap gap-2 pb-4 border-b border-white/[0.06]">
                <HandHistory modeId={modeId} />
                <StatsView modeId={modeId} />
                <DeckSelector />
              </div>

              {/* Lobby button */}
              <button
                onClick={handleLobby}
                className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest px-3 py-2.5 rounded-lg border border-white/[0.06] text-white/60 hover:text-white/60 hover:border-white/[0.10] transition-all touch-manipulation"
                data-testid="link-lobby-menu"
              >
                <Home className="w-3.5 h-3.5" />
                {isMidHand ? 'Leave Table (forfeit)' : 'Back to Lobby'}
              </button>

            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Exit confirmation */}
      <AlertDialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <AlertDialogContent className="max-w-[340px] sm:max-w-md bg-[#141417] border-white/[0.06] rounded-2xl mx-4 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white/85 text-base font-sans font-semibold">Leave this hand?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60 text-sm leading-relaxed">
              You are mid-hand. Leaving forfeits your cards{pot > 0 && <> and your claim to the <span className="font-mono font-bold text-[#C9A227]/80">${pot}</span> pot</>}. Chips are saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="bg-white/[0.03] border-white/[0.06] text-white/60 mt-0">Stay</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExit} className="bg-red-600/80 hover:bg-red-600 text-white border-0" data-testid="button-confirm-leave">
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
