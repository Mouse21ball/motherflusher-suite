import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/lib/poker/types';
import { Send, MessageSquare, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/session';

interface ChatBoxProps {
  messages: ChatMessage[];
  myId: string;
  onSendMessage: (text: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  seatToPlayerId?: Record<string, string>;
  myProfileId?: string;
}

interface MenuState {
  msgId: string;
  name: string;
  profileId: string;
  x: number;
  y: number;
}

interface BlockTarget { name: string; profileId: string }
interface ReportTarget { name: string; profileId: string; msgId: string }

const REPORT_REASONS = [
  { value: 'harassment',         label: 'Harassment' },
  { value: 'cheating',           label: 'Cheating' },
  { value: 'spam',               label: 'Spam' },
  { value: 'offensive_language', label: 'Offensive Language' },
  { value: 'impersonation',      label: 'Impersonation' },
  { value: 'other',              label: 'Other' },
] as const;

export function ChatBox({ messages, myId, onSendMessage, open, onOpenChange, seatToPlayerId, myProfileId }: ChatBoxProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const [menu, setMenu] = useState<MenuState | null>(null);

  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [blocking, setBlocking] = useState(false);

  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState('harassment');
  const [reportNotes, setReportNotes] = useState('');
  const [reporting, setReporting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLength = useRef(messages.length);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener('click', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('touchstart', close);
    };
  }, [menu]);

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      if (!isOpen) {
        setUnreadCount(prev => prev + (messages.length - prevMessagesLength.current));
      } else {
        scrollToBottom();
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      scrollToBottom();
    }
  }, [isOpen]);

  const scrollToBottom = () => {
    setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) { onSendMessage(inputText.trim()); setInputText(''); }
  };

  function canAct(msg: ChatMessage): boolean {
    if (msg.senderId === myId) return false;
    const pid = seatToPlayerId?.[msg.senderId];
    return !!pid && pid !== myProfileId;
  }

  function openMenuForMsg(e: React.MouseEvent, msg: ChatMessage) {
    const profileId = seatToPlayerId?.[msg.senderId];
    if (!profileId) return;
    e.preventDefault();
    setMenu({ msgId: msg.id, name: msg.senderName, profileId, x: e.clientX, y: e.clientY });
  }

  function startLongPress(msg: ChatMessage) {
    return (e: React.TouchEvent) => {
      const profileId = seatToPlayerId?.[msg.senderId];
      if (!profileId || profileId === myProfileId) return;
      const touch = e.touches[0];
      const x = touch?.clientX ?? 0; const y = touch?.clientY ?? 0;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = setTimeout(() => {
        setMenu({ msgId: msg.id, name: msg.senderName, profileId, x, y });
      }, 500);
    };
  }

  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  async function confirmBlock() {
    if (!blockTarget) return;
    setBlocking(true);
    try {
      const res = await apiFetch('/api/players/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedId: blockTarget.profileId }),
      });
      if (res.ok) {
        toast({ title: `Blocked ${blockTarget.name}` });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: (data as { error?: string })?.error ?? 'Could not block player.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network error.', variant: 'destructive' });
    } finally {
      setBlocking(false); setBlockTarget(null);
    }
  }

  async function submitReport() {
    if (!reportTarget) return;
    setReporting(true);
    try {
      const res = await apiFetch('/api/players/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportedId:  reportTarget.profileId,
          reason:      reportReason,
          context:     reportTarget.msgId,
          contextType: 'table_chat',
          notes:       reportNotes.trim() || undefined,
        }),
      });
      if (res.ok) {
        toast({ title: 'Report submitted. Our team will review it.' });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: (data as { error?: string })?.error ?? 'Could not submit report.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network error.', variant: 'destructive' });
    } finally {
      setReporting(false); setReportTarget(null); setReportReason('harassment'); setReportNotes('');
    }
  }

  const winW = typeof window !== 'undefined' ? window.innerWidth : 400;

  return (
    <>
      {/* Context menu */}
      {menu && (
        <div
          className="fixed z-[200] rounded-xl shadow-2xl py-1 border border-white/[0.08] min-w-[160px]"
          style={{ top: menu.y, left: Math.min(menu.x, winW - 180), background: '#1a1a1f' }}
          onClick={e => e.stopPropagation()}
          data-testid="chat-context-menu"
        >
          <button
            className="w-full text-left px-4 py-2.5 text-sm font-mono text-red-400/80 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
            onClick={() => { setBlockTarget({ name: menu.name, profileId: menu.profileId }); setMenu(null); }}
            data-testid="chat-menu-block"
          >
            Block {menu.name}
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-sm font-mono text-amber-400/80 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
            onClick={() => { setReportTarget({ name: menu.name, profileId: menu.profileId, msgId: menu.msgId }); setMenu(null); }}
            data-testid="chat-menu-report"
          >
            Report {menu.name}
          </button>
        </div>
      )}

      {/* Block confirmation modal */}
      {blockTarget && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setBlockTarget(null)}
          data-testid="block-confirm-overlay"
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-white/[0.08] p-5 space-y-4"
            style={{ background: '#17171c' }}
            onClick={e => e.stopPropagation()}
            data-testid="block-confirm-modal"
          >
            <div>
              <div className="text-sm font-semibold text-white/85 mb-1.5">Block {blockTarget.name}?</div>
              <p className="text-xs font-mono text-white/60 leading-relaxed">
                You won't see their messages. You can unblock them in Settings.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest transition-all bg-white/[0.05] text-white/60 hover:bg-white/[0.08] active:scale-[0.97]"
                onClick={() => setBlockTarget(null)}
                data-testid="block-confirm-cancel"
              >Cancel</button>
              <button
                className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest transition-all bg-red-500/20 text-red-400/90 hover:bg-red-500/30 active:scale-[0.97] disabled:opacity-50"
                onClick={confirmBlock}
                disabled={blocking}
                data-testid="block-confirm-submit"
              >{blocking ? 'Blocking…' : 'Block'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {reportTarget && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => { setReportTarget(null); setReportReason('harassment'); setReportNotes(''); }}
          data-testid="report-modal-overlay"
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-white/[0.08] p-5 space-y-4"
            style={{ background: '#17171c' }}
            onClick={e => e.stopPropagation()}
            data-testid="report-modal"
          >
            <div>
              <div className="text-sm font-semibold text-white/85 mb-1">Report {reportTarget.name}</div>
              <p className="text-xs font-mono text-white/60 leading-relaxed">
                Our team reviews all reports. False reports may result in account action.
              </p>
            </div>
            <div>
              <label className="block text-[12px] font-mono uppercase tracking-widest text-white/60 mb-1.5">Reason</label>
              <select
                value={reportReason}
                onChange={e => setReportReason(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm font-mono bg-black/40 text-white/75 border border-white/[0.08] focus:outline-none focus:border-white/20"
                data-testid="report-reason-select"
              >
                {REPORT_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-mono uppercase tracking-widest text-white/60 mb-1.5">Notes (optional)</label>
              <textarea
                value={reportNotes}
                onChange={e => setReportNotes(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Additional details…"
                className="w-full rounded-xl px-3 py-2 text-sm font-mono bg-black/40 text-white/65 border border-white/[0.08] focus:outline-none focus:border-white/20 resize-none placeholder:text-white/60"
                data-testid="report-notes-textarea"
              />
              <div className="text-right text-[12px] font-mono text-white/60 mt-0.5" data-testid="report-notes-counter">
                {reportNotes.length}/500
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest bg-white/[0.05] text-white/60 hover:bg-white/[0.08] active:scale-[0.97] transition-all"
                onClick={() => { setReportTarget(null); setReportReason('harassment'); setReportNotes(''); }}
                data-testid="report-cancel"
              >Cancel</button>
              <button
                className="flex-1 h-9 rounded-xl text-xs font-mono font-bold uppercase tracking-widest bg-amber-500/20 text-amber-400/90 hover:bg-amber-500/30 active:scale-[0.97] transition-all disabled:opacity-50"
                onClick={submitReport}
                disabled={reporting}
                data-testid="report-submit"
              >{reporting ? 'Sending…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}

      <div
        role="dialog"
        aria-label="Table chat"
        className={`fixed top-0 bottom-0 right-0 z-50 w-80 sm:w-96 bg-[#0B0B0D]/98 border-l border-white/[0.06] backdrop-blur-xl shadow-2xl flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] bg-[#141417]/80">
          <h2 className="text-white/70 font-mono text-xs tracking-widest uppercase flex items-center gap-2.5 font-medium">
            <MessageSquare className="w-3.5 h-3.5 text-[#C9A227]/70" />
            Table Chat
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/60 hover:text-white/60 active:text-white/60 transition-colors rounded-lg hover:bg-white/[0.04] touch-manipulation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-white/60 text-xs font-mono mt-10 tracking-wide">
              No messages yet
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === myId;
              const actable = canAct(msg);
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <span className="text-[12px] text-white/60 mb-1 mx-1 font-mono tracking-wide">{msg.senderName}</span>
                  <div
                    className={`max-w-[85%] px-3.5 py-2 text-sm leading-relaxed select-none ${
                      isMe
                        ? 'bg-[#C9A227]/15 text-[#C9A227]/90 rounded-2xl rounded-br-md border border-[#C9A227]/10'
                        : 'bg-white/[0.04] text-white/60 rounded-2xl rounded-bl-md border border-white/[0.04]'
                    } ${actable ? 'cursor-pointer active:opacity-70' : ''}`}
                    onContextMenu={actable ? (e) => openMenuForMsg(e, msg) : undefined}
                    onTouchStart={actable ? startLongPress(msg) : undefined}
                    onTouchEnd={actable ? cancelLongPress : undefined}
                    onTouchMove={actable ? cancelLongPress : undefined}
                    data-testid={`chat-bubble-${msg.id}`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="h-8 bg-gradient-to-t from-[#0B0B0D]/80 to-transparent pointer-events-none flex-shrink-0" />

        <form onSubmit={handleSubmit} className="p-3 border-t border-white/[0.06] bg-[#141417]/60">
          <div className="flex items-center gap-2 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-[#0B0B0D]/80 border border-white/[0.08] rounded-xl py-2.5 pl-4 pr-10 text-sm text-white/80 placeholder:text-white/60 font-mono focus:outline-none focus:border-[#C9A227]/25 focus:ring-1 focus:ring-[#C9A227]/10 transition-all duration-200"
              maxLength={150}
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              aria-label="Send message"
              className="absolute right-1.5 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[#C9A227]/60 hover:text-[#C9A227]/90 disabled:text-white/60 transition-colors rounded-lg hover:bg-[#C9A227]/5 disabled:hover:bg-transparent touch-manipulation"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
