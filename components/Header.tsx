
import React, { useState } from 'react';
import { Zone } from '../types';

interface HeaderProps {
  zone: Zone | null;
  timeLeft: number;
  status: 'connected' | 'reconnecting' | 'offline';
  isHost: boolean;
  password?: string;
  unreadCount: number;
  onExitRequest: () => void;
  onShare: () => void;
}

const Header: React.FC<HeaderProps> = ({ zone, timeLeft, status, isHost, password, unreadCount, onExitRequest, onShare }) => {
  const [showPwd, setShowPwd] = useState(false);

  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    switch(status) {
      case 'connected': return 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]';
      case 'reconnecting': return 'bg-orange-500 animate-pulse';
      default: return 'bg-red-500';
    }
  };

  return (
    <header className="h-16 shrink-0 border-b border-white/5 flex items-center justify-between px-5 glass z-50">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor()}`}></div>
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border border-black"></div>
          )}
        </div>
        <div className="flex flex-col -gap-1">
          <h1 className="font-black tracking-tighter text-sm uppercase">Locus Chat</h1>
          <span className="text-[7px] mono text-gray-500 uppercase tracking-widest">
            {zone ? `${zone.userCount || 1} IN ZONE • ` : ''}10KM • 2H
          </span>
        </div>
      </div>

      {zone ? (
        <div className="flex items-center gap-4">
          {isHost && zone.type === 'private' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest hidden sm:inline">KEY:</span>
              <button 
                onClick={() => setShowPwd(!showPwd)}
                className="mono text-[10px] font-bold text-white/40 hover:text-white transition-colors"
              >
                {showPwd ? password : '••••'}
              </button>
            </div>
          )}

          <div className="flex flex-col items-end">
             <span className={`mono text-[11px] font-bold ${timeLeft < 300000 ? 'text-red-500' : 'text-green-500'}`}>
               {formatTime(timeLeft)}
             </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button 
              onClick={onShare}
              className="p-2 text-white/40 hover:text-white transition-colors"
              title="Share Zone"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6a3 3 0 100-2.684m0 2.684l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
            <button onClick={onExitRequest} className="p-2 text-gray-500 hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="text-[8px] sm:text-[9px] text-gray-700 font-bold mono uppercase tracking-widest text-right">
          Awaiting <br className="sm:hidden" /> Connection
        </div>
      )}
    </header>
  );
};

export default Header;
