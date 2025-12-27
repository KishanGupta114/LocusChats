
import React, { useState, useRef, useEffect } from 'react';
import { Message, User } from '../types';
import { moderateContent } from '../services/geminiService';

interface ChatRoomProps {
  messages: Message[];
  currentUser: User | null;
  onSendMessage: (text: string) => void;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ messages, currentUser, onSendMessage }) => {
  const [input, setInput] = useState('');
  const [isModerating, setIsModerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    // Immediate scroll on new messages
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleResize = () => {
      // Delay slightly for iOS keyboard animation
      setTimeout(scrollToBottom, 150);
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isModerating) return;

    setIsModerating(true);
    const check = await moderateContent(text);
    setIsModerating(false);

    if (check.safe) {
      onSendMessage(text);
      setInput('');
      if (textAreaRef.current) textAreaRef.current.style.height = 'auto';
      setTimeout(scrollToBottom, 50);
    } else {
      alert(`Message blocked: ${check.reason || 'Harmful content detected'}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden">
      {/* Message Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-6 no-scrollbar"
      >
        {messages.map((msg, idx) => {
          const isMe = msg.sender === currentUser?.username;
          const showSender = idx === 0 || messages[idx-1].sender !== msg.sender || messages[idx-1].isSystem;

          if (msg.isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-6">
                <span className="text-[10px] mono uppercase tracking-[0.2em] text-gray-500 bg-white/5 px-4 py-1.5 rounded-full border border-white/5 font-medium">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div 
              key={msg.id} 
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              {showSender && (
                <div className={`flex items-baseline gap-2 mb-1.5 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <span className={`text-[10px] font-black uppercase tracking-wider ${isMe ? 'text-white' : 'text-gray-500'}`}>
                    {msg.sender}
                  </span>
                  <span className="text-[9px] text-gray-700 font-medium">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
              <div 
                className={`min-w-[40px] max-w-[82%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed break-words shadow-lg ${
                  isMe 
                    ? 'bubble-me rounded-tr-none' 
                    : 'bubble-them text-gray-200 rounded-tl-none'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        {/* Extra bottom padding inside list */}
        <div className="h-4"></div>
      </div>

      {/* Modern Compact Input Area */}
      <div className="px-4 py-3 sm:py-4 border-t border-white/5 bg-[#0d0d0d]/80 backdrop-blur-xl pb-[max(1rem,env(safe-area-inset-bottom, 1rem))]">
        <form 
          onSubmit={handleSubmit} 
          className="relative max-w-4xl mx-auto flex items-end gap-3"
        >
          <div className="flex-1 min-h-[46px] relative bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden focus-within:border-white/30 transition-all">
            <textarea 
              ref={textAreaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 640) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={isModerating ? "Moderating..." : "Type a message..."}
              disabled={isModerating}
              className="w-full bg-transparent px-4 py-3 pr-12 focus:outline-none transition placeholder:text-gray-600 text-[15px] resize-none max-h-32 block leading-snug"
              style={{ height: 'auto' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${target.scrollHeight}px`;
              }}
            />
            {/* Submit Icon inside input for small screens */}
            <button 
              type="submit"
              disabled={!input.trim() || isModerating}
              className="absolute right-2 bottom-1.5 p-2 text-white disabled:opacity-20 transition active:scale-90"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
        <div className="mt-3 text-center opacity-40 select-none">
            <span className="text-[9px] text-gray-400 mono uppercase tracking-[0.2em] font-bold">Privacy Guaranteed • Ephemeral Only</span>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;
