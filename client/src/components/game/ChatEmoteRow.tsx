import { MessageSquare } from "lucide-react";
import { ReactionBar } from "./ReactionBar";
import type { ReactionEvent } from "@/lib/poker/types";
import { cn } from "@/lib/utils";

interface ChatEmoteRowProps {
  onOpenChat: () => void;
  onReact: (emoji: string) => void;
  incomingReactions?: ReactionEvent[];
  phaseHint?: string;
  chatUnread?: number;
}

export function ChatEmoteRow({ onOpenChat, onReact, incomingReactions, phaseHint, chatUnread = 0 }: ChatEmoteRowProps) {
  return (
    <div className="relative z-[35] w-full max-w-md mx-auto px-3 flex flex-col items-stretch gap-2" data-testid="row-chat-emote">

      {/* Main row: chat toggle + emote strip */}
      <div className="flex items-center gap-2">

        {/* Chat toggle */}
        <button
          onClick={onOpenChat}
          aria-label="Open chat"
          className="relative flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-black/50 text-white/60 hover:text-white/80 active:scale-95 transition-all touch-manipulation shrink-0"
          data-testid="button-open-chat"
        >
          <MessageSquare className="w-4 h-4" />
          {chatUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#C9A227] text-[#0B0B0D] text-[12px] font-bold flex items-center justify-center leading-none">
              {chatUnread > 9 ? '9+' : chatUnread}
            </span>
          )}
        </button>

        {/* Emote strip — ReactionBar in inline mode */}
        <div className="flex-1 overflow-hidden">
          <ReactionBar
            onReact={onReact}
            incomingReactions={incomingReactions}
          />
        </div>

      </div>

      {/* Hint pill */}
      {phaseHint && (
        <div
          key={phaseHint}
          className="flex items-start gap-2 px-3 py-2 rounded-xl anim-hint-enter"
          style={{ background: 'rgba(201,162,39,0.04)', border: '1px solid rgba(201,162,39,0.10)' }}
          data-testid="text-phase-hint"
        >
          <span className="text-[13px] shrink-0 mt-0.5 leading-none" aria-hidden="true">💡</span>
          <span className="text-[11px] leading-snug font-mono tracking-wide" style={{ color: 'rgba(201,162,39,0.65)' }}>
            {phaseHint}
          </span>
        </div>
      )}

    </div>
  );
}
