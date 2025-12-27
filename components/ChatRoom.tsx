
import React, { useState, useRef, useEffect } from 'react';
import { Message, User } from '../types';
import { moderateContent } from '../services/geminiService';

interface ChatRoomProps {
  messages: Message[];
  currentUser: User | null;
  typingUsers: Record<string, number>;
  onSendMessage: (text: string) => void;
  onTyping: () => void;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ messages, currentUser, typingUsers, onSendMessage, onTyping }) => {
  const [input, setInput] = useState('');
  const [isModerating, setIsModerating] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const activeTypingList = Object.keys(typingUsers).filter(u => u !== currentUser?.username);
  const hasText = input.trim().length > 0;

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      const scrollHeight = scrollRef.current.scrollHeight;
      scrollRef.current.scrollTo({
        top: scrollHeight,
        behavior
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTypingList.length]);

  const adjustTextareaHeight = () => {
    const textarea = textAreaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 128);
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY = newHeight >= 128 ? 'auto' : 'hidden';
      scrollToBottom('auto');
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || isModerating) return;

    setIsModerating(true);
    const check = await moderateContent(text);
    setIsModerating(false);

    if (check.safe) {
      onSendMessage(text);
      setInput('');
      setJustSent(true);
      
      if (textAreaRef.current) {
        textAreaRef.current.style.height = 'auto';
        textAreaRef.current.style.overflowY = 'hidden';
        textAreaRef.current.focus(); 
      }
      
      setTimeout(() => setJustSent(false), 500);
      setTimeout(() => scrollToBottom('smooth'), 50);
    } else {
      alert(`Message blocked: ${check.reason || 'Harmful content detected'}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden relative">
      {/* Message Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 space-y-6 no-scrollbar"
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
      >
        {messages.map((msg, idx) => {
          const isMe = msg.sender === currentUser?.username;
          const showSender = idx === 0 || messages[idx-1].sender !== msg.sender || messages[idx-1].isSystem;

          if (msg.isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-6">
                <span className="text-[10px] mono uppercase tracking-[0.25em] text-gray-500 bg-white/5 px-4 py-1.5 rounded-full border border-white/5 font-semibold">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div 
              key={msg.id} 
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-message`}
            >
              {showSender && (
                <div className={`flex items-baseline gap-2 mb-2 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <span className={`text-[10px] font-black uppercase tracking-wider ${isMe ? 'text-white' : 'text-gray-500'}`}>
                    {msg.sender}
                  </span>
                  <span className="text-[9px] text-gray-700 font-bold mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
              <div 
                className={`min-w-[40px] max-w-[88%] px-4 py-3 rounded-2xl text-[15px] leading-relaxed break-words shadow-2xl transition-all ${
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
        
        {activeTypingList.length > 0 && (
          <div className="flex items-start animate-message">
            <div className="flex flex-col items-start">
               <div className="flex items-baseline gap-2 mb-2 px-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                    {activeTypingList.length === 1 ? activeTypingList[0] : `${activeTypingList.length} people`}
                  </span>
                </div>
                <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"></div>
                </div>
            </div>
          </div>
        )}
        <div className="h-4"></div>
      </div>

      {/* Input Area */}
      <div className="shrink-0 px-4 py-3 sm:py-4 border-t border-white/5 glass bg-[#0d0d0d]/98 pb-[max(1rem,env(safe-area-inset-bottom, 1rem))]">
        <form 
          onSubmit={handleSubmit} 
          className="relative max-w-4xl mx-auto flex items-end gap-3"
        >
          <div className="flex-1 min-h-[48px] bg-white/[0.04] border border-white/10 rounded-2xl focus-within:border-white/30 transition-all flex items-center overflow-hidden">
            <textarea 
              ref={textAreaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustTextareaHeight();
                if (e.target.value.trim().length > 0) {
                  onTyping();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={isModerating ? "Verifying..." : "Message zone..."}
              disabled={isModerating}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              className="w-full bg-transparent px-4 py-3 focus:outline-none transition-all placeholder:text-gray-600 text-[16px] resize-none max-h-[128px] block leading-snug appearance-none"
              style={{ height: 'auto' }}
            />
          </div>
          
          <div className="flex-none flex items-center justify-center w-12 h-12">
            <button 
              type="submit"
              disabled={!hasText || isModerating}
              className={`w-full h-full rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${
                hasText || isModerating
                  ? 'bg-white text-black opacity-100 scale-100' 
                  : 'bg-white/5 text-gray-700 opacity-0 scale-50 pointer-events-none'
              } ${justSent ? 'bg-green-500 scale-110' : 'active:scale-90'} ${hasText ? 'animate-send-pop' : ''}`}
            >
              {isModerating ? (
                <div className="w-5 h-5 border-[3px] border-black/10 border-t-black rounded-full animate-spin"></div>
              ) : justSent ? (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg 
                  className={`w-6 h-6 transition-transform duration-300 ${hasText ? 'translate-x-0.5 -translate-y-0.5' : 'rotate-45'}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </form>
        
        <div className="mt-2 flex items-center justify-center gap-6 opacity-30 select-none">
            <span className="text-[8px] text-gray-500 mono uppercase tracking-[0.4em] font-black">Memory Only</span>
            <span className="text-[8px] text-gray-500 mono uppercase tracking-[0.4em] font-black">Anonymous</span>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;
