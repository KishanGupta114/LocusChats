
import React, { useState, useRef, useEffect } from 'react';
import { Message, User, MediaType } from '../types';
import { moderateContent } from '../services/geminiService';
import { MAX_VIDEO_DURATION_S } from '../constants';
import { compressImage, fileToBase64, isSafePayloadSize, getSupportedAudioMimeType, getSupportedVideoMimeType } from '../utils/media';

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
  const [recordingMode, setRecordingMode] = useState<'none' | 'audio' | 'video'>('none');
  const [recordingTime, setRecordingTime] = useState(0);
  const [processingMedia, setProcessingMedia] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
              alert("Video file is too large (>1MB). Direct recording in the app is recommended for better compression.");
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
          alert("Image is too complex to send over the ephemeral tunnel.");
        } else {
          onSendMessage('', 'image', compressedBase64);
        }
        setProcessingMedia(false);
      } else {
        alert("Unsupported file type.");
        setProcessingMedia(false);
      }
    } catch (err) {
      console.error("Media processing failed", err);
      alert("Failed to process media.");
      setProcessingMedia(false);
    }
    e.target.value = '';
  };

  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
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
          alert("Audio recording too large.");
        }
        setProcessingMedia(false);
        cleanupStream();
      };

      recorder.start();
      setRecordingMode('audio');
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      alert("Microphone access denied.");
    }
  };

  const startVideoRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 480, height: 480, frameRate: 15 }, 
        audio: true 
      });
      streamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      
      const mimeType = getSupportedVideoMimeType();
      // Target very low bitrate to fit 60s into 1MB (approx 130kbps)
      const recorder = new MediaRecorder(stream, { 
        mimeType, 
        videoBitsPerSecond: 100000, 
        audioBitsPerSecond: 32000 
      });
      
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      recorder.onstop = async () => {
        setProcessingMedia(true);
        const videoBlob = new Blob(audioChunksRef.current, { type: 'video/webm' });
        const base64 = await fileToBase64(videoBlob);
        if (isSafePayloadSize(base64)) {
          onSendMessage('', 'video', base64);
        } else {
          alert("Video too large to send.");
        }
        setProcessingMedia(false);
        cleanupStream();
      };

      recorder.start();
      setRecordingMode('video');
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_VIDEO_DURATION_S - 1) {
            stopRecording();
            return MAX_VIDEO_DURATION_S;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      alert("Camera/Mic access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecordingMode('none');
      clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = () => cleanupStream();
      mediaRecorderRef.current.stop();
    }
    setRecordingMode('none');
    clearInterval(timerRef.current);
  };

  const cleanupStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
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
                {msg.type === 'text' && <div className="px-4 py-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{msg.text}</div>}
                
                {msg.type === 'image' && (
                  <div className="bg-black/20 min-h-[100px] flex items-center justify-center">
                    <img 
                      src={msg.mediaData} 
                      alt="Shared" 
                      className="max-h-[60vh] w-auto object-contain cursor-pointer"
                      onClick={() => {
                        const win = window.open();
                        win?.document.write(`<body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;"><img src="${msg.mediaData}" style="max-width:100%;max-height:100%;"></body>`);
                      }}
                    />
                  </div>
                )}
                
                {msg.type === 'video' && (
                  <video controls playsInline className="max-h-[60vh] w-full bg-black">
                    <source src={msg.mediaData} />
                  </video>
                )}
                
                {msg.type === 'audio' && (
                  <div className="px-4 py-3 min-w-[240px] flex items-center bg-white/5">
                    <audio controls className="w-full h-10 scale-95 invert contrast-125">
                      <source src={msg.mediaData} />
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

      {/* Media Interaction Panel */}
      <div className="shrink-0 px-4 py-4 border-t border-white/5 bg-[#0a0a0a] z-50">
        <div className="max-w-4xl mx-auto flex flex-col gap-3">
          
          {recordingMode !== 'none' && (
            <div className="bg-[#111] border border-white/10 rounded-2xl p-4 animate-slide-down shadow-2xl">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">
                      Recording {recordingMode}
                    </span>
                  </div>
                  <span className="mono text-sm font-bold text-red-500">
                    {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                  </span>
                </div>

                {recordingMode === 'video' && (
                  <div className="aspect-square w-full max-w-[200px] mx-auto overflow-hidden rounded-xl border border-white/10 bg-black">
                    <video ref={videoPreviewRef} autoPlay muted playsInline className="w-full h-full object-cover grayscale" />
                  </div>
                )}

                <div className="flex gap-2">
                  <button 
                    onClick={stopRecording}
                    className="flex-1 py-3 bg-white text-black font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-gray-200 transition-all"
                  >
                    Finish & Send
                  </button>
                  <button 
                    onClick={cancelRecording}
                    className="px-6 py-3 bg-white/5 text-gray-400 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {processingMedia && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 flex items-center justify-between animate-pulse">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">Processing Media...</span>
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}

          {recordingMode === 'none' && !processingMedia && (
            <div className="relative bg-[#111] border border-white/5 rounded-[2.5rem] flex flex-col overflow-hidden focus-within:border-white/20 transition-all p-2">
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
                placeholder={isModerating ? "Moderating..." : "Say something..."}
                disabled={isModerating}
                className="w-full bg-transparent px-5 py-4 focus:outline-none placeholder:text-gray-600 text-[16px] resize-none leading-relaxed text-white overflow-hidden"
              />
              
              <div className="flex items-center justify-between px-3 pb-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*,video/*" 
                    onChange={handleFileUpload}
                  />
                  
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white transition-colors hover:bg-white/5 rounded-full"
                    title="Attach File"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>

                  <button 
                    onClick={startAudioRecording}
                    className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white transition-colors hover:bg-white/5 rounded-full"
                    title="Record Audio"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m14 0v1a7 7 0 01-14 0v-1m14 0a7 7 0 00-7-7 7 7 0 00-7 7m7 5V4m0 0L8 8m4-4l4 4" />
                    </svg>
                  </button>

                  <button 
                    onClick={startVideoRecording}
                    className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white transition-colors hover:bg-white/5 rounded-full"
                    title="Record Video"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>

                <button 
                  onClick={handleSubmit}
                  disabled={!input.trim() || isModerating}
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
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;
