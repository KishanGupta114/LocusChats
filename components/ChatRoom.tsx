
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const activeTypingList = Object.keys(typingUsers).filter(u => u !== currentUser?.username);

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
      
      if (textAreaRef.current) {
        textAreaRef.current.style.height = 'auto';
        textAreaRef.current.style.overflowY = 'hidden';
        textAreaRef.current.focus(); 
      }
      
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
      <div className="shrink-0 px-4 py-3 sm:py-4 border-t border-white/5 glass bg-[#0d0d0d]/98 pb-[max(1.5rem,env(safe-area-inset-bottom, 1.5rem))]">
        <form 
          onSubmit={handleSubmit} 
          className="relative max-w-4xl mx-auto"
        >
          <div className={`relative bg-white/[0.04] border rounded-2xl transition-all flex items-center overflow-hidden ${isModerating ? 'border-white/30 brightness-110' : 'border-white/10 focus-within:border-white/30'}`}>
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
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={isModerating ? "Encrypting message..." : "Type message and tap enter..."}
              disabled={isModerating}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              className="w-full bg-transparent px-4 py-3.5 focus:outline-none transition-all placeholder:text-gray-600 text-[16px] resize-none max-h-[128px] block leading-snug appearance-none text-white"
              style={{ height: 'auto' }}
            />
            
            {/* Inline Loading dot */}
            {isModerating && (
              <div className="absolute right-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
              </div>
            )}
          </div>
        </form>
        
        <div className="mt-2.5 flex items-center justify-center gap-6 opacity-20 select-none">
            <span className="text-[7px] text-gray-500 mono uppercase tracking-[0.5em] font-black">Secure Tunnel</span>
            <span className="text-[7px] text-gray-500 mono uppercase tracking-[0.5em] font-black">Auto-Purge active</span>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;
