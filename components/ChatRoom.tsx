
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
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [reviewData, setReviewData] = useState<{ type: MediaType; data: string } | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processingMedia, setProcessingMedia] = useState(false);
  const [fullScreenMedia, setFullScreenMedia] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const audioCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (recordingMode === 'video' && videoPreviewRef.current && streamRef.current) {
      videoPreviewRef.current.srcObject = streamRef.current;
    }
  }, [recordingMode, streamRef.current]);

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
          if (video.duration > MAX_VIDEO_DURATION_S + 1) {
            alert(`Video exceeds ${MAX_VIDEO_DURATION_S}s limit.`);
            setProcessingMedia(false);
          } else {
            const base64 = await fileToBase64(file);
            if (!isSafePayloadSize(base64)) {
              alert("File too large. Try recording directly in-app for better compression.");
              setProcessingMedia(false);
            } else {
              setReviewData({ type: 'video', data: base64 });
              setProcessingMedia(false);
            }
          }
        };
        video.src = URL.createObjectURL(file);
      } else if (file.type.startsWith('image/')) {
        const compressedBase64 = await compressImage(file);
        setReviewData({ type: 'image', data: compressedBase64 });
        setProcessingMedia(false);
      } else {
        alert("Unsupported file type.");
        setProcessingMedia(false);
      }
    } catch (err) {
      console.error("Media processing error", err);
      setProcessingMedia(false);
    }
    e.target.value = '';
  };

  const drawWaveform = (analyser: AnalyserNode) => {
    const canvas = audioCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      analyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ef4444';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    render();
  };

  const startAudioRecording = async () => {
    try {
      cleanupStream();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      source.connect(analyser);
      
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        setProcessingMedia(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const base64 = await fileToBase64(audioBlob);
        setReviewData({ type: 'audio', data: base64 });
        setProcessingMedia(false);
        cleanupStream();
      };

      recorder.start();
      setRecordingMode('audio');
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
      
      setTimeout(() => drawWaveform(analyser), 100);
    } catch (err) {
      alert("Microphone required for session.");
    }
  };

  const toggleCamera = async () => {
    const isRecording = mediaRecorderRef.current?.state === 'recording';
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    }
    cleanupStream();
    setRecordingMode('none');

    setTimeout(() => {
      setFacingMode(newFacing);
      startVideoRecording(newFacing);
    }, 150);
  };

  const startVideoRecording = async (mode = facingMode) => {
    try {
      cleanupStream();
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: mode, width: { ideal: 480 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }, 
        audio: true 
      });
      streamRef.current = stream;
      
      const mimeType = getSupportedVideoMimeType();
      const recorder = new MediaRecorder(stream, { 
        mimeType, 
        videoBitsPerSecond: 105000, 
        audioBitsPerSecond: 32000 
      });
      
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        setProcessingMedia(true);
        const videoBlob = new Blob(audioChunksRef.current, { type: 'video/webm' });
        const base64 = await fileToBase64(videoBlob);
        if (isSafePayloadSize(base64)) {
          setReviewData({ type: 'video', data: base64 });
        } else {
          alert("Recording too large. Try a shorter clip.");
        }
        setProcessingMedia(false);
        cleanupStream();
      };

      recorder.start();
      setRecordingMode('video');
      setRecordingTime(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_VIDEO_DURATION_S) {
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
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      setRecordingMode('none');
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = () => cleanupStream();
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    }
    setRecordingMode('none');
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupStream();
  };

  const cleanupStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  };

  const handleSendMedia = () => {
    if (reviewData) {
      setProcessingMedia(true);
      onSendMessage('', reviewData.type, reviewData.data);
      setReviewData(null);
      // Let the processing indicator linger slightly for feedback
      setTimeout(() => {
        setProcessingMedia(false);
        scrollToBottom('smooth');
      }, 300);
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
      if (textAreaRef.current) textAreaRef.current.style.height = 'auto';
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
                {msg.type === 'text' && <div className="px-4 py-3 text-[15px] font-medium leading-relaxed break-words whitespace-pre-wrap">{msg.text}</div>}
                
                {msg.type === 'image' && (
                  <img 
                    src={msg.mediaData} 
                    alt="Shared" 
                    className="max-h-[60vh] w-auto object-contain cursor-pointer active:scale-98 transition-transform"
                    onClick={() => setFullScreenMedia(msg.mediaData || null)}
                  />
                )}
                
                {msg.type === 'video' && (
                  <video controls playsInline style={{ transform: 'none' }} className="max-h-[60vh] w-full bg-black">
                    <source src={msg.mediaData} />
                  </video>
                )}
                
                {msg.type === 'audio' && (
                  <div className="px-4 py-3 min-w-[240px] bg-white/5 flex flex-col gap-1">
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

      {/* In-App Image Lightbox */}
      {fullScreenMedia && (
        <div className="absolute inset-0 z-[200] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
           <button 
             onClick={() => setFullScreenMedia(null)}
             className="absolute top-8 right-8 w-12 h-12 flex items-center justify-center bg-white/10 text-white rounded-full hover:bg-white/20 transition-all active:scale-90"
           >
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
             </svg>
           </button>
           <img src={fullScreenMedia} className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-sm" alt="Expanded content" />
           <p className="mt-6 text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mono">Volatile Buffer View</p>
        </div>
      )}

      {/* Media Overlay Panel */}
      {(recordingMode !== 'none' || reviewData) && (
        <div className="absolute inset-x-0 bottom-0 z-[100] px-4 pb-6 animate-slide-up">
          <div className="max-w-md mx-auto glass border border-white/10 rounded-[2.5rem] p-6 shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-1 bg-white/5 overflow-hidden">
               {recordingMode !== 'none' && (
                 <div 
                   className="h-full bg-red-500 transition-all duration-1000" 
                   style={{ width: `${(recordingTime / MAX_VIDEO_DURATION_S) * 100}%` }}
                 />
               )}
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  {reviewData ? 'Review Recording' : `Recording ${recordingMode}`}
                </span>
                <span className="mono text-xs font-bold text-red-500">
                  {reviewData ? 'READY' : `${recordingTime}s / 60s`}
                </span>
              </div>

              <div className="aspect-video w-full rounded-2xl bg-black border border-white/5 overflow-hidden flex items-center justify-center relative">
                {recordingMode === 'video' && (
                  <>
                    <video 
                      ref={videoPreviewRef} 
                      autoPlay 
                      muted 
                      playsInline 
                      style={{ transform: 'none' }} 
                      className="w-full h-full object-cover" 
                    />
                    <button 
                      onClick={toggleCamera}
                      className="absolute bottom-4 right-4 p-3 bg-black/60 text-white rounded-full backdrop-blur-xl border border-white/10 hover:bg-black/80 transition-all active:scale-90 shadow-2xl"
                      title="Switch Camera"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </>
                )}
                {recordingMode === 'audio' && (
                  <canvas ref={audioCanvasRef} className="w-full h-32" />
                )}
                {reviewData?.type === 'image' && (
                  <img src={reviewData.data} className="w-full h-full object-contain" />
                )}
                {reviewData?.type === 'video' && (
                  <video src={reviewData.data} autoPlay loop muted playsInline style={{ transform: 'none' }} className="w-full h-full object-cover" />
                )}
                {reviewData?.type === 'audio' && (
                  <div className="text-red-500 animate-pulse">
                    <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20"><path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 005.93 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" /></svg>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                {reviewData ? (
                  <>
                    <button 
                      onClick={handleSendMedia} 
                      disabled={processingMedia}
                      className="flex-1 py-4 bg-white text-black font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-gray-200 transition-all active:scale-95 shadow-xl disabled:opacity-50"
                    >
                      {processingMedia ? 'SENDING...' : 'Send To Zone'}
                    </button>
                    <button onClick={() => setReviewData(null)} disabled={processingMedia} className="px-6 py-4 bg-white/5 text-gray-400 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white/10 transition-all disabled:opacity-50">Discard</button>
                  </>
                ) : (
                  <>
                    <button onClick={stopRecording} className="flex-1 py-4 bg-red-500 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20">Stop Recording</button>
                    <button onClick={cancelRecording} className="px-6 py-4 bg-white/5 text-gray-400 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white/10 transition-all">Cancel</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interaction Panel */}
      <div className="shrink-0 px-4 py-4 border-t border-white/5 bg-[#0a0a0a] z-50">
        <div className="max-w-4xl mx-auto flex flex-col gap-3">
          
          {processingMedia && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center justify-between animate-pulse shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">Encrypting & Sending Payload...</span>
              </div>
              <span className="text-[10px] font-bold text-blue-500/50 mono">SECURE</span>
            </div>
          )}

          {recordingMode === 'none' && !reviewData && !processingMedia && (
            <div className="relative bg-[#111] border border-white/5 rounded-[2.5rem] flex flex-col overflow-hidden focus-within:border-white/20 transition-all p-2 shadow-2xl">
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
                placeholder={isModerating ? "Verifying..." : "Message everyone..."}
                disabled={isModerating || processingMedia}
                className="w-full bg-transparent px-5 py-4 focus:outline-none placeholder:text-gray-600 text-[16px] font-medium resize-none leading-relaxed text-white overflow-hidden"
              />
              
              <div className="flex items-center justify-between px-3 pb-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileUpload} />
                  
                  <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 rounded-full transition-all">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </button>

                  <button onClick={startAudioRecording} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 rounded-full transition-all">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m14 0v1a7 7 0 01-14 0v-1m14 0a7 7 0 00-7-7 7 7 0 00-7 7m7 5V4m0 0L8 8m4-4l4 4" /></svg>
                  </button>

                  <button onClick={() => startVideoRecording('user')} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 rounded-full transition-all">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2-2v8a2 2 0 002 2z" /></svg>
                  </button>
                </div>

                <button 
                  onClick={handleSubmit}
                  disabled={!input.trim() || isModerating || processingMedia}
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${
                    input.trim() && !isModerating && !processingMedia ? 'bg-white text-black shadow-xl scale-100' : 'bg-white/5 text-gray-700 scale-90 opacity-50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" /></svg>
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
