
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isModerating) return;

    setIsModerating(true);
    // Lightweight content check
    const check = await moderateContent(text);
    setIsModerating(false);

    if (check.safe) {
      onSendMessage(text);
      setInput('');
    } else {
      alert(`Message blocked: ${check.reason || 'Harmful content detected'}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-hidden">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scroll-smooth"
      >
        {messages.map((msg) => {
          const isMe = msg.sender === currentUser?.username;
          if (msg.isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-4 sm:my-6">
                <span className="text-[9px] sm:text-[10px] mono uppercase tracking-widest text-gray-500 bg-white/5 px-3 py-1 rounded-full border border-white/5">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div 
              key={msg.id} 
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-tight ${isMe ? 'text-white' : 'text-gray-500'}`}>
                  {msg.sender}
                </span>
                <span className="text-[8px] sm:text-[9px] text-gray-700 mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div 
                className={`max-w-[90%] sm:max-w-[85%] px-4 py-2 sm:py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe 
                    ? 'bg-white text-black rounded-tr-none' 
                    : 'bg-white/5 border border-white/5 rounded-tl-none'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 pb-[env(safe-area-inset-bottom,1rem)] border-t border-white/5 glass">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto flex gap-2 sm:gap-3">
          <input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isModerating ? "Analyzing..." : "Message zone..."}
            disabled={isModerating}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl px-4 py-2.5 sm:px-5 sm:py-3 focus:outline-none focus:border-white/30 transition placeholder:text-gray-600 text-sm"
          />
          <button 
            type="submit"
            disabled={!input.trim() || isModerating}
            className="bg-white text-black h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex items-center justify-center hover:bg-gray-200 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
        <div className="mt-2 text-center">
            <span className="text-[8px] sm:text-[10px] text-gray-600 mono uppercase tracking-tight">Encrypted • Anonymous • No History</span>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;
