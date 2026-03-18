import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/lib/poker/types';
import { Send, MessageSquare, X } from 'lucide-react';

interface ChatBoxProps {
  messages: ChatMessage[];
  myId: string;
  onSendMessage: (text: string) => void;
}

export function ChatBox({ messages, myId, onSendMessage }: ChatBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLength = useRef(messages.length);

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
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open chat"
        className={`fixed bottom-[180px] sm:bottom-[160px] right-3 sm:right-4 z-40 p-2.5 sm:p-3 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center rounded-xl glass-panel text-white/60 hover:text-white/80 shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 touch-manipulation ${isOpen ? 'hidden' : 'block'}`}
      >
        <MessageSquare className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-[#C9A227] text-[#0B0B0D] text-[9px] font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-md">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <div 
        role="dialog"
        aria-label="Table chat"
        className={`fixed inset-y-0 right-0 z-50 w-80 sm:w-96 bg-[#0B0B0D]/98 border-l border-white/[0.06] backdrop-blur-xl shadow-2xl flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] bg-[#141417]/80">
          <h2 className="text-white/70 font-mono text-xs tracking-widest uppercase flex items-center gap-2.5 font-medium">
            <MessageSquare className="w-3.5 h-3.5 text-[#C9A227]/70" />
            Table Chat
          </h2>
          <button 
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/30 hover:text-white/60 active:text-white/60 transition-colors rounded-lg hover:bg-white/[0.04] touch-manipulation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-white/20 text-xs font-mono mt-10 tracking-wide">
              No messages yet
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === myId;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <span className="text-[9px] text-white/25 mb-1 mx-1 font-mono tracking-wide">{msg.senderName}</span>
                  <div 
                    className={`max-w-[85%] px-3.5 py-2 text-sm leading-relaxed ${
                      isMe 
                        ? 'bg-[#C9A227]/15 text-[#C9A227]/90 rounded-2xl rounded-br-md border border-[#C9A227]/10' 
                        : 'bg-white/[0.04] text-white/60 rounded-2xl rounded-bl-md border border-white/[0.04]'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="p-3 border-t border-white/[0.06] bg-[#141417]/60">
          <div className="flex items-center gap-2 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-[#0B0B0D]/80 border border-white/[0.08] rounded-xl py-2.5 pl-4 pr-10 text-sm text-white/80 placeholder:text-white/20 font-mono focus:outline-none focus:border-[#C9A227]/25 focus:ring-1 focus:ring-[#C9A227]/10 transition-all duration-200"
              maxLength={150}
            />
            <button 
              type="submit"
              disabled={!inputText.trim()}
              aria-label="Send message"
              className="absolute right-1.5 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[#C9A227]/60 hover:text-[#C9A227]/90 disabled:text-white/15 transition-colors rounded-lg hover:bg-[#C9A227]/5 disabled:hover:bg-transparent touch-manipulation"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
