
import React, { useEffect, useState } from 'react';

interface FooterProps {
  status: 'connected' | 'reconnecting' | 'offline';
  timeLeft: number;
  totalTime: number;
  distance: number | null;
  fingerprint: string;
}

const Footer: React.FC<FooterProps> = ({ status, timeLeft, totalTime, distance, fingerprint }) => {
  const [hash, setHash] = useState('');

  // Generate a rotating "cryptographic handshake" hash for aesthetics
  useEffect(() => {
    const interval = setInterval(() => {
      const chars = '0123456789ABCDEF';
      let result = '';
      for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      setHash(result);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const progress = (timeLeft / totalTime) * 100;
  const getProgressColor = () => {
    if (progress < 10) return 'bg-red-500';
    if (progress < 30) return 'bg-orange-500';
    return 'bg-green-500/50';
  };

  return (
    <footer className="h-7 shrink-0 border-t border-white/5 bg-black flex items-center justify-between px-3 sm:px-4 z-[60] select-none pointer-events-none overflow-hidden">
      {/* Left: System ID & Status */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0 overflow-hidden">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[7px] sm:text-[8px] font-black text-gray-700 mono uppercase tracking-[0.2em]">NODE:</span>
          <span className="text-[7px] sm:text-[8px] font-bold text-white/30 mono uppercase">{fingerprint.slice(0, 4)}</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 border-l border-white/10 pl-4 overflow-hidden">
          <span className="text-[8px] font-black text-gray-700 mono uppercase tracking-[0.2em]">TUNNEL:</span>
          <span className={`text-[8px] font-bold mono uppercase truncate max-w-[100px] ${status === 'connected' ? 'text-green-500/60' : 'text-orange-500/60'}`}>
            {status === 'connected' ? `SECURE_${hash}` : 'WAITING...'}
          </span>
        </div>
      </div>

      {/* Middle: Session Decay (Entropy) */}
      <div className="flex items-center gap-2 sm:gap-3 w-20 sm:w-32 md:w-48 shrink-0">
        <span className="hidden sm:inline text-[8px] font-black text-gray-700 mono uppercase tracking-[0.2em] shrink-0">ENTROPY</span>
        <div className="flex-1 h-[2px] bg-white/5 rounded-full overflow-hidden flex min-w-[30px]">
          <div 
            className={`h-full transition-all duration-1000 ${getProgressColor()}`} 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Right: Location & Privacy Badge */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[7px] sm:text-[8px] font-black text-gray-700 mono uppercase tracking-[0.2em]">RADIAL:</span>
          <span className="text-[7px] sm:text-[8px] font-bold text-white/40 mono shrink-0">
            {distance !== null ? `${distance.toFixed(2)}K` : '...'}
          </span>
        </div>
        <div className="hidden xs:flex items-center gap-1.5 bg-white/5 px-1.5 py-0.5 rounded-sm border border-white/5 shrink-0">
          <div className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-[6px] sm:text-[7px] font-black text-blue-400/80 mono uppercase tracking-widest whitespace-nowrap">RAM_STORE_ONLY</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
