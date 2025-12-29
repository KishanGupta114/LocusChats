
import React, { useState, useRef, useEffect } from 'react';
import { Message, User, MediaType } from '../types';
import { moderateContent } from '../services/geminiService';
import { MAX_VIDEO_DURATION_S } from '../constants';
import { compressImage, fileToBase64, isSafePayloadSize, getSupportedAudioMimeType, getSupportedVideoMimeType } from '../utils/media';

interface ChatRoomProps {
  messages: Message[];
  currentUser: User | null;
  typingUsers: Record<string, number>;
  onSendMessage: (text: string, type: MediaType, mediaData?: string) => Promise<void>;
  onTyping: () => void;
  onRead: () => void;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ messages, currentUser, typingUsers, onSendMessage, onTyping, onRead }) => {
  const [input, setInput] = useState('');
  const [isModerating, setIsModerating] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'none' | 'audio' | 'video'>('none');
  const [reviewData, setReviewData] = useState<{ type: MediaType; data: string } | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [fullScreenMedia, setFullScreenMedia] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessageBadge, setShowNewMessageBadge] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const activeTypingList = Object.keys(typingUsers).filter(u => u !== currentUser?.username);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 120;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setShowNewMessageBadge(false);
      onRead();
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
    }
  };

  useEffect(() => {
    if (isAtBottom) scrollToBottom('smooth');
    else if (messages.length > 0) setShowNewMessageBadge(true);
  }, [messages.length, activeTypingList.length]);

  const handleSend = async () => {
    if (!input.trim() || isModerating) return;
    setIsModerating(true);
    const moderation = await moderateContent(input);
    if (!moderation.safe) {
      alert(`Content Rejected: ${moderation.reason || 'Safety violation.'}`);
      setIsModerating(false);
      return;
    }
    try {
      await onSendMessage(input.trim(), 'text');
      setInput('');
      if (textAreaRef.current) textAreaRef.current.style.height = 'auto';
    } finally {
      setIsModerating(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingStatus("OPTIMIZING PAYLOAD...");
    try {
      const compressed = await compressImage(file);
      if (!isSafePayloadSize(compressed)) {
        alert("Payload exceeds ephemeral tunnel limit (1MB).");
      } else {
        setReviewData({ type: 'image', data: compressed });
      }
    } catch (err) { alert("Failed to process image."); }
    finally { setProcessingStatus(null); }
  };

  const WelcomeBlock = () => (
    <div className="py-16 px-6 text-center animate-in fade-in slide-in-from-top duration-1000 shrink-0">
      <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
      </div>
      <h2 className="text-2xl font-black uppercase tracking-tighter text-white mb-2">Zone Initialized</h2>
      <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-10">Secure Ephemeral Tunnel Active</p>
      <div className="max-w-[200px] mx-auto grid grid-cols-2 gap-6">
        <div className="text-center">
          <span className="block text-[8px] font-black text-gray-700 uppercase tracking-widest mb-1.5">Encryption</span>
          <span className="block text-[9px] font-bold text-white/40 mono uppercase">Transient</span>
        </div>
        <div className="text-center">
          <span className="block text-[8px] font-black text-gray-700 uppercase tracking-widest mb-1.5">Storage</span>
          <span className="block text-[9px] font-bold text-white/40 mono uppercase">Volatile</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto no-scrollbar pb-36 pt-4">
        <div className="flex flex-col justify-end min-h-full">
          <WelcomeBlock />
          
          <div className="px-4 sm:px-6 space-y-5">
            {messages.map((msg, i) => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center py-4 animate-in fade-in zoom-in duration-500">
                    <div className="flex items-center gap-3 bg-white/[0.03] px-4 py-1.5 rounded-full border border-white/5">
                      <div className={`w-1 h-1 rounded-full ${msg.systemType === 'join' ? 'bg-green-500 animate-pulse' : 'bg-red-500/50'}`}></div>
                      <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] mono">
                        {msg.sender} {msg.systemType === 'join' ? 'JOINED' : 'LEFT'} ZONE
                      </span>
                    </div>
                  </div>
                );
              }

              const isMe = msg.sender === currentUser?.username;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-message`}>
                  <div className="flex items-baseline gap-2 mb-1.5 px-2">
                    {!isMe && <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">{msg.sender}</span>}
                    <span className="text-[8px] font-bold text-gray-800 mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  </div>
                  <div className={`max-w-[88%] sm:max-w-[70%] rounded-2xl px-5 py-3.5 shadow-xl ${isMe ? 'bubble-me' : 'bubble-them'}`}>
                    {msg.type === 'text' && <p className="text-[14px] leading-relaxed break-words">{msg.text}</p>}
                    {msg.type === 'image' && <img src={msg.mediaData} alt="Shared" className="rounded-xl w-full max-h-[400px] object-contain cursor-zoom-in" onClick={() => setFullScreenMedia(msg.mediaData || null)} />}
                    {msg.type === 'audio' && <audio src={msg.mediaData} controls className="h-10 w-full max-w-[200px] invert" />}
                    {msg.type === 'video' && <video src={msg.mediaData} controls className="rounded-xl w-full max-h-[400px] bg-black" />}
                  </div>
                </div>
              );
            })}
          </div>

          {activeTypingList.length > 0 && (
            <div className="px-8 py-6 animate-pulse">
              <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mono">
                {activeTypingList.join(', ')} typing...
              </span>
            </div>
          )}
        </div>
      </div>

      {showNewMessageBadge && (
        <button onClick={() => scrollToBottom()} className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-2xl z-40 animate-in slide-in-from-bottom duration-300">
          Syncing New Signals
        </button>
      )}

      {/* Aligned Input Tray */}
      <div className="p-4 sm:p-6 pb-10 glass border-t border-white/5 z-50">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-[2.2rem] p-1.5 focus-within:border-white/20 transition-all shadow-inner">
            <button onClick={() => fileInputRef.current?.click()} className="p-3.5 text-white/40 hover:text-white transition-colors shrink-0 active:scale-90" title="Attach Signal">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
            
            <textarea
              ref={textAreaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                onTyping();
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Broadcast frequency..."
              className="flex-1 bg-transparent py-3.5 px-2 focus:outline-none text-[15px] text-white resize-none max-h-32 leading-tight"
            />

            <button 
              onClick={handleSend} 
              disabled={!input.trim() || isModerating} 
              className="w-11 h-11 bg-white text-black rounded-full flex items-center justify-center disabled:opacity-20 transition-all shrink-0 ml-1 shadow-lg active:scale-90"
            >
              {isModerating ? (
                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {reviewData && (
        <div className="fixed inset-0 z-[101] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-8 animate-in zoom-in duration-300">
          <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/30 mb-12">Review Broadcast Payload</h2>
          <div className="w-full max-w-lg mb-12 glass border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
            {reviewData.type === 'image' && <img src={reviewData.data} alt="Review" className="w-full h-auto max-h-[60vh] object-contain" />}
          </div>
          <div className="flex gap-4 w-full max-w-xs">
            <button onClick={() => setReviewData(null)} className="flex-1 py-5 bg-white/5 text-white/40 font-black uppercase tracking-widest text-[10px] rounded-2xl">Abort</button>
            <button onClick={async () => {
              await onSendMessage('', reviewData.type, reviewData.data);
              setReviewData(null);
            }} className="flex-1 py-5 bg-white text-black font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl active:scale-95 transition-transform">Broadcast</button>
          </div>
        </div>
      )}

      {fullScreenMedia && (
        <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setFullScreenMedia(null)}>
           <img src={fullScreenMedia} alt="Fullscreen" className="w-full h-full object-contain animate-in zoom-in duration-300" />
        </div>
      )}
    </div>
  );
};

export default ChatRoom;
