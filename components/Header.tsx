
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
  onBrandClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  zone, 
  timeLeft, 
  status, 
  isHost, 
  password, 
  unreadCount, 
  onExitRequest, 
  onShare,
  onBrandClick
}) => {
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

  const memberCount = zone?.userCount || 1;

  return (
    <header className="h-16 shrink-0 border-b border-white/5 flex items-center justify-between px-4 sm:px-5 glass z-50 overflow-hidden">
      {/* Left Section: Brand, Room Name & Status */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-1 min-w-0">
        <div className="relative shrink-0">
          <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor()}`}></div>
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border border-black"></div>
          )}
        </div>
        
        {/* Brand Area - Home Button */}
        <button 
          onClick={onBrandClick}
          className="flex flex-col min-w-0 text-left hover:opacity-70 transition-opacity active:scale-95 group"
        >
          {/* Brand Identity */}
          <h1 className="font-black tracking-tighter text-sm uppercase leading-none mb-0.5 shrink-0 group-active:text-white/60">Locus</h1>
          
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Room Name - Always Visible with truncation safety */}
            <span className="text-[9px] sm:text-[10px] mono font-bold text-white/80 uppercase tracking-widest truncate max-w-[80px] sm:max-w-[150px]">
              {zone ? zone.name : 'EPHEMERAL'}
            </span>
            
            {/* Mobile-only Member Badge */}
            {zone && (
              <div className="sm:hidden flex items-center gap-1 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-full shrink-0">
                <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-[8px] font-black text-white/60 mono leading-none">
                  {memberCount}
                </span>
              </div>
            )}
          </div>
        </button>
      </div>

      {/* Desktop-only Center Badge */}
      {zone && (
        <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 items-center gap-2">
          <div className="bg-white/5 border border-white/10 px-3 py-1 rounded-full flex items-center gap-2 shadow-inner">
            <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/60 mono">
              {memberCount} {memberCount === 1 ? 'MEMBER' : 'ACTIVE'}
            </span>
          </div>
        </div>
      )}

      {/* Right Section: Time & Actions */}
      {zone ? (
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {isHost && zone.type === 'private' && (
            <div className="flex items-center gap-1.5 bg-white/[0.03] px-2 py-1 rounded-lg border border-white/5 shrink-0">
              <svg className="w-3 h-3 text-white/20" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
              </svg>
              <button 
                onClick={() => setShowPwd(!showPwd)}
                className="mono text-[10px] font-bold text-white/60 hover:text-white transition-colors"
              >
                {showPwd ? password : '••••'}
              </button>
            </div>
          )}

          <div className="flex flex-col items-end min-w-[40px] shrink-0">
             <span className={`mono text-[11px] font-bold ${timeLeft < 300000 ? 'text-red-500 animate-pulse' : 'text-green-500'}`}>
               {formatTime(timeLeft)}
             </span>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button 
              onClick={onShare}
              className="p-1.5 sm:p-2 text-white/40 hover:text-white transition-colors"
              title="Share Zone"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6a3 3 0 100-2.684m0 2.684l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
            <button onClick={onExitRequest} className="p-1.5 sm:p-2 text-gray-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg>
            </button>
          </div>
        </div>
      ) : (
        <button 
          onClick={onBrandClick}
          className="text-[9px] text-gray-700 font-bold mono uppercase tracking-widest text-right shrink-0 hover:text-white transition-colors"
        >
          {status === 'connected' ? 'SYNCED' : 'SEARCHING...'}
        </button>
      )}
    </header>
  );
};

export default Header;
