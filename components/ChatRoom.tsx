
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
      const newHeight = Math.min(textarea.scrollHeight, 180);
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY = newHeight >= 180 ? 'auto' : 'hidden';
      scrollToBottom('auto');
    }
  };

  const handleSubmit = async () => {
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

      {/* Modern High-Fidelity Input Area */}
      <div className="shrink-0 px-4 py-3 sm:py-6 border-t border-white/5 bg-[#0a0a0a] pb-[max(1.5rem,env(safe-area-inset-bottom, 1.5rem))]">
        <div className="max-w-4xl mx-auto">
          <div className={`relative bg-[#1a1a1a] border rounded-[1.8rem] transition-all flex flex-col overflow-hidden p-2 ${isModerating ? 'border-white/20' : 'border-white/5 focus-within:border-white/20'}`}>
            
            {/* Textarea Section */}
            <textarea 
              ref={textAreaRef}
              rows={1}
              value={input}
              enterKeyHint="send"
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
              placeholder={isModerating ? "Transmitting..." : "Make changes, add new features, ask for anything"}
              disabled={isModerating}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              className="w-full bg-transparent px-4 py-2 mt-1 focus:outline-none transition-all placeholder:text-gray-500 text-[16px] resize-none max-h-[180px] block leading-relaxed appearance-none text-white overflow-hidden"
              style={{ height: 'auto' }}
            />
            
            {/* Bottom Utility Bar */}
            <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
              {/* Left Spacer or additional icons could go here */}
              <div></div>

              {/* Icon Tray (Matches Image) */}
              <div className="flex items-center gap-3">
                {/* Scribble/Pencil Icon */}
                <button type="button" className="p-2 text-gray-500 hover:text-white transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                    <path d="m15 5 4 4" />
                  </svg>
                </button>

                {/* Microphone Icon */}
                <button type="button" className="p-2 text-gray-500 hover:text-white transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                </button>

                {/* Plus/Add Icon */}
                <button type="button" className="p-2 text-gray-500 hover:text-white transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </button>

                {/* Send Button (Circular with Arrow) */}
                <button 
                  type="button"
                  onClick={handleSubmit}
                  disabled={!input.trim() || isModerating}
                  className={`p-2.5 rounded-full transition-all duration-300 ${
                    input.trim() && !isModerating 
                    ? 'bg-white text-black scale-100 shadow-lg' 
                    : 'bg-white/5 text-gray-700 scale-95 opacity-50'
                  }`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 7-7 7 7" />
                    <path d="M12 19V5" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Subtle Moderation Indicator Overlay */}
            {isModerating && (
              <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                <div className="w-full h-1 absolute bottom-0 bg-white/20 overflow-hidden">
                  <div className="w-1/3 h-full bg-white animate-loading-bar"></div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-4 flex items-center justify-center gap-6 opacity-30 select-none">
            <span className="text-[7px] text-gray-500 mono uppercase tracking-[0.5em] font-black italic">End-to-End Tunnel</span>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;
