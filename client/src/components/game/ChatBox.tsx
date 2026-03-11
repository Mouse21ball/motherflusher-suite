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
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open chat"
        className={`fixed top-20 right-4 z-40 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/60 border border-white/10 backdrop-blur-md text-white shadow-lg transition-transform hover:scale-105 active:scale-95 touch-manipulation ${isOpen ? 'hidden' : 'block'}`}
      >
        <MessageSquare className="w-5 h-5 text-gray-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      <div 
        role="dialog"
        aria-label="Table chat"
        className={`fixed inset-y-0 right-0 z-50 w-80 sm:w-96 bg-black/95 border-l border-white/10 backdrop-blur-xl shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <h2 className="text-white font-mono text-sm tracking-wider uppercase flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-green-400" />
            Table Chat
          </h2>
          <button 
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-white active:text-white transition-colors rounded-lg hover:bg-white/10 touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 text-sm italic mt-10">
              No messages yet. Say hello!
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === myId;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-gray-500 mb-1 ml-1">{msg.senderName}</span>
                  <div 
                    className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                      isMe 
                        ? 'bg-green-600/80 text-white rounded-br-sm' 
                        : 'bg-white/10 text-gray-200 rounded-bl-sm border border-white/5'
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

        <form onSubmit={handleSubmit} className="p-4 border-t border-white/10 bg-white/5">
          <div className="flex items-center gap-2 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-black/50 border border-white/20 rounded-full py-2 pl-4 pr-10 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all"
              maxLength={150}
            />
            <button 
              type="submit"
              disabled={!inputText.trim()}
              aria-label="Send message"
              className="absolute right-1 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-green-400 hover:text-green-300 disabled:text-gray-600 transition-colors rounded-full hover:bg-white/10 disabled:hover:bg-transparent touch-manipulation"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
