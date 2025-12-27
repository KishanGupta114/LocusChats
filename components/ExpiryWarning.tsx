
import React from 'react';

interface ExpiryWarningProps {
  onDismiss: () => void;
  onRestart: () => void;
}

const ExpiryWarning: React.FC<ExpiryWarningProps> = ({ onDismiss, onRestart }) => {
  return (
    <div className="absolute top-4 left-4 right-4 z-[60] animate-slide-down">
      <div className="max-w-md mx-auto glass border border-white/10 rounded-2xl p-5 shadow-2xl overflow-hidden relative">
        {/* Glow effect */}
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-orange-500/20 blur-3xl rounded-full"></div>
        
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          
          <div className="flex-1">
            <h3 className="text-sm font-black uppercase tracking-widest text-white mb-1">Session Expiring</h3>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              This secure tunnel will collapse in <span className="text-orange-400 font-bold">5 minutes</span>. All messages will be permanently wiped.
            </p>
            
            <div className="flex gap-3">
              <button 
                onClick={onRestart}
                className="px-4 py-2 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-gray-200 transition-all active:scale-95"
              >
                Start New
              </button>
              <button 
                onClick={onDismiss}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-white/10 transition-all"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpiryWarning;
