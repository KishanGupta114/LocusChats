
import React, { useState, useRef, useEffect } from 'react';
import { Message, User, MediaType } from '../types';
import { moderateContent } from '../services/geminiService';
import { MAX_VIDEO_DURATION_S } from '../constants';
import { compressImage, fileToBase64, isSafePayloadSize } from '../utils/media';

interface ChatRoomProps {
  messages: Message[];
  currentUser: User | null;
  typingUsers: Record<string, number>;
  onSendMessage: (text: string, type: MediaType, mediaData?: string) => void;
  onTyping: () => void;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ messages, currentUser, typingUsers, onSendMessage, onTyping }) => {
  const [input, setInput] = useState('');
  const [isModerating, setIsModerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processingMedia, setProcessingMedia] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const activeTypingList = Object.keys(typingUsers).filter(u => u !== currentUser?.username);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTypingList.length]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingMedia(true);

    try {
      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = async () => {
          window.URL.revokeObjectURL(video.src);
          if (video.duration > MAX_VIDEO_DURATION_S) {
            alert(`Video exceeds ${MAX_VIDEO_DURATION_S}s limit.`);
            setProcessingMedia(false);
          } else {
            const base64 = await fileToBase64(file);
            if (!isSafePayloadSize(base64)) {
              alert("Video file size is too large for the ephemeral tunnel. Try a lower resolution.");
              setProcessingMedia(false);
            } else {
              onSendMessage('', 'video', base64);
              setProcessingMedia(false);
            }
          }
        };
        video.src = URL.createObjectURL(file);
      } else if (file.type.startsWith('image/')) {
        const compressedBase64 = await compressImage(file);
        if (!isSafePayloadSize(compressedBase64)) {
          alert("Image is too large even after compression.");
        } else {
          onSendMessage('', 'image', compressedBase64);
        }
        setProcessingMedia(false);
      }
    } catch (err) {
      console.error("Media processing failed", err);
      alert("Failed to process media.");
      setProcessingMedia(false);
    }
    
    e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      recorder.onstop = async () => {
        setProcessingMedia(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const base64 = await fileToBase64(audioBlob);
        
        if (isSafePayloadSize(base64)) {
          onSendMessage('', 'audio', base64);
        } else {
          alert("Audio recording too long to transmit.");
        }
        
        setProcessingMedia(false);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 59) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      alert("Microphone access is required for voice notes.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isModerating || processingMedia) return;

    setIsModerating(true);
    const check = await moderateContent(text);
    setIsModerating(false);

    if (check.safe) {
      onSendMessage(text, 'text');
      setInput('');
      if (textAreaRef.current) {
        textAreaRef.current.style.height = 'auto';
        textAreaRef.current.focus(); 
      }
      setTimeout(() => scrollToBottom('smooth'), 50);
    } else {
      alert(`Blocked: ${check.reason || 'Safety violation'}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden relative">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 space-y-6 no-scrollbar"
      >
        {messages.map((msg, idx) => {
          const isMe = msg.sender === currentUser?.username;
          const showSender = idx === 0 || messages[idx-1].sender !== msg.sender || messages[idx-1].isSystem;

          if (msg.isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-6">
                <span className="text-[9px] mono uppercase tracking-[0.3em] text-gray-600 font-bold bg-white/[0.03] px-4 py-1 rounded-full">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-message`}>
              {showSender && (
                <div className={`flex items-baseline gap-2 mb-1 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${isMe ? 'text-white' : 'text-gray-500'}`}>
                    {msg.sender}
                  </span>
                </div>
              )}
              
              <div className={`max-w-[85%] rounded-2xl overflow-hidden shadow-2xl transition-all ${
                isMe ? 'bubble-me rounded-tr-none' : 'bubble-them text-gray-200 rounded-tl-none'
              }`}>
                {msg.type === 'text' && <div className="px-4 py-3 text-[15px] leading-relaxed">{msg.text}</div>}
                
                {msg.type === 'image' && (
                  <div className="bg-black/20 min-h-[100px] flex items-center justify-center">
                    <img 
                      src={msg.mediaData} 
                      alt="Shared content" 
                      className="max-h-[70vh] w-auto object-contain cursor-pointer"
                      onClick={() => {
                        const win = window.open();
                        win?.document.write(`<img src="${msg.mediaData}" style="max-width:100%;height:auto;background:#000;">`);
                      }}
                    />
                  </div>
                )}
                
                {msg.type === 'video' && (
                  <video controls className="max-h-[70vh] w-full bg-black">
                    <source src={msg.mediaData} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                )}
                
                {msg.type === 'audio' && (
                  <div className="px-4 py-3 min-w-[240px] flex items-center bg-white/5">
                    <audio controls className="w-full h-8 scale-95 opacity-80 invert">
                      <source src={msg.mediaData} type="audio/webm" />
                    </audio>
                  </div>
                )}
              </div>
              <span className="text-[8px] text-gray-700 font-bold mono mt-1 px-1">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })}
        
        {activeTypingList.length > 0 && (
          <div className="flex items-start animate-message">
            <div className="bg-white/5 border border-white/10 px-3 py-2 rounded-2xl rounded-tl-none flex items-center gap-1">
              <div className="w-1 h-1 rounded-full bg-gray-500 animate-bounce"></div>
              <div className="w-1 h-1 rounded-full bg-gray-500 animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-1 h-1 rounded-full bg-gray-500 animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}
      </div>

      {/* Input Tray */}
      <div className="shrink-0 px-4 py-4 border-t border-white/5 bg-[#0a0a0a] z-50">
        <div className="max-w-4xl mx-auto flex flex-col gap-3">
          
          {(isRecording || processingMedia) && (
            <div className={`flex items-center justify-between border rounded-2xl p-3 animate-pulse ${isRecording ? 'bg-red-500/10 border-red-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${isRecording ? 'text-red-500' : 'text-blue-500'}`}>
                  {isRecording ? 'Recording Secure Audio...' : 'Encrypting Payload...'}
                </span>
              </div>
              {isRecording && <span className="mono text-xs font-bold text-red-500">{recordingTime}s / 60s</span>}
            </div>
          )}

          <div className="relative bg-[#111] border border-white/5 rounded-[2rem] flex flex-col overflow-hidden focus-within:border-white/20 transition-all p-1.5">
            <textarea 
              ref={textAreaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const t = e.target;
                t.style.height = 'auto';
                t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
                if (e.target.value.length > 0) onTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={isModerating ? "Verifying..." : "Type something..."}
              disabled={isModerating || isRecording || processingMedia}
              className="w-full bg-transparent px-4 py-3 focus:outline-none placeholder:text-gray-600 text-[16px] resize-none leading-relaxed text-white overflow-hidden"
            />
            
            <div className="flex items-center justify-between px-2 pb-1.5">
              <div className="flex items-center gap-1">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/jpeg,image/png,video/mp4,video/quicktime" 
                  onChange={handleFileUpload}
                />
                
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRecording || processingMedia}
                  className="p-2.5 text-gray-500 hover:text-white transition-colors hover:bg-white/5 rounded-full disabled:opacity-30"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>

                <button 
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                  onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                  disabled={processingMedia}
                  className={`p-2.5 transition-all rounded-full ${isRecording ? 'text-red-500 bg-red-500/10 scale-110 shadow-lg shadow-red-500/20' : 'text-gray-500 hover:text-white hover:bg-white/5 disabled:opacity-30'}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m14 0v1a7 7 0 01-14 0v-1m14 0a7 7 0 00-7-7 7 7 0 00-7 7m7 5V4m0 0L8 8m4-4l4 4" />
                  </svg>
                </button>
              </div>

              <button 
                onClick={handleSubmit}
                disabled={!input.trim() || isModerating || processingMedia}
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${
                  input.trim() && !isModerating ? 'bg-white text-black scale-100 shadow-xl' : 'bg-white/5 text-gray-700 scale-90 opacity-50'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;
