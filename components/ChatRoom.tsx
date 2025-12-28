
import React, { useState, useRef, useEffect } from 'react';
import { Message, User, MediaType } from '../types';
import { moderateContent } from '../services/geminiService';
import { MAX_VIDEO_DURATION_S } from '../constants';

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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = async () => {
        window.URL.revokeObjectURL(video.src);
        if (video.duration > MAX_VIDEO_DURATION_S) {
          alert(`Video must be under ${MAX_VIDEO_DURATION_S} seconds.`);
        } else {
          processAndSendMedia(file, 'video');
        }
      };
      video.src = URL.createObjectURL(file);
    } else if (file.type.startsWith('image/')) {
      processAndSendMedia(file, 'image');
    }
    
    // Reset input
    e.target.value = '';
  };

  const processAndSendMedia = async (file: File | Blob, type: MediaType) => {
    setIsModerating(true);
    try {
      const base64 = await fileToBase64(file as File);
      // For images, we can optionally moderate the prompt or description, 
      // but here we just flag it as "media attached"
      onSendMessage('', type, base64);
    } catch (err) {
      console.error("Media processing failed", err);
    } finally {
      setIsModerating(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        processAndSendMedia(audioBlob as File, 'audio');
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isModerating) return;

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
                {msg.type === 'text' && <div className="px-4 py-3 text-[15px]">{msg.text}</div>}
                
                {msg.type === 'image' && (
                  <img 
                    src={msg.mediaData} 
                    alt="Uploaded" 
                    className="max-h-80 w-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(msg.mediaData, '_blank')}
                  />
                )}
                
                {msg.type === 'video' && (
                  <video controls className="max-h-80 w-full bg-black">
                    <source src={msg.mediaData} type="video/mp4" />
                  </video>
                )}
                
                {msg.type === 'audio' && (
                  <div className="px-3 py-2 min-w-[200px]">
                    <audio controls className="w-full h-8 scale-90">
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

      {/* Media Input Area */}
      <div className="shrink-0 px-4 py-4 border-t border-white/5 bg-[#0a0a0a] z-50">
        <div className="max-w-4xl mx-auto flex flex-col gap-3">
          
          {isRecording && (
            <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-2xl p-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-xs font-black uppercase tracking-widest text-red-500">Recording Voice Note...</span>
              </div>
              <span className="mono text-sm font-bold text-red-500">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
            </div>
          )}

          <div className="relative bg-[#111] border border-white/5 rounded-3xl flex flex-col overflow-hidden focus-within:border-white/10 transition-all">
            <textarea 
              ref={textAreaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustTextareaHeight();
                if (e.target.value.length > 0) onTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={isModerating ? "Analyzing payload..." : "Type something..."}
              disabled={isModerating || isRecording}
              className="w-full bg-transparent px-5 py-4 focus:outline-none placeholder:text-gray-600 text-[16px] resize-none leading-relaxed appearance-none text-white overflow-hidden"
            />
            
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*,video/*" 
                  onChange={handleFileUpload}
                />
                
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-gray-500 hover:text-white transition-colors hover:bg-white/5 rounded-full"
                  title="Upload Image/Video"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>

                <button 
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  className={`p-2 transition-all rounded-full ${isRecording ? 'text-red-500 bg-red-500/10 scale-125' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                  title="Hold to Record Voice"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m14 0v1a7 7 0 01-14 0v-1m14 0a7 7 0 00-7-7 7 7 0 00-7 7m7 5V4m0 0L8 8m4-4l4 4" />
                  </svg>
                </button>
              </div>

              <button 
                onClick={handleSubmit}
                disabled={!input.trim() || isModerating}
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${
                  input.trim() && !isModerating ? 'bg-white text-black scale-100 shadow-xl' : 'bg-white/5 text-gray-700 scale-90'
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
