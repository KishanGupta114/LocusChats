
import React, { useState } from 'react';
import { Zone } from '../types';

interface HeaderProps {
  zone: Zone | null;
  timeLeft: number;
  distance: number | null;
  onExit: () => void;
}

const Header: React.FC<HeaderProps> = ({ zone, timeLeft, distance, onExit }) => {
  const [copied, setCopied] = useState(false);

  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleShare = async () => {
    if (!zone) return;
    
    // Create shareable data
    const data = {
      i: zone.id,
      la: zone.center.lat,
      lo: zone.center.lng,
      e: zone.expiresAt
    };
    const encoded = btoa(JSON.stringify(data));
    const url = `${window.location.origin}${window.location.pathname}?z=${encoded}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Locus Chat Zone',
          text: 'I am in a private 2km chat zone. Join me before it expires!',
          url: url,
        });
      } catch (err) {
        console.log('Share failed', err);
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 glass sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
        <h1 className="font-bold tracking-tight text-lg">LOCUS<span className="text-gray-500 font-normal">CHAT</span></h1>
      </div>

      {zone ? (
        <div className="flex items-center gap-4 sm:gap-6">
          <button 
            onClick={handleShare}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition border border-white/5"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span className="text-xs font-medium">{copied ? 'Copied!' : 'Share'}</span>
          </button>

          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Presence</span>
            <span className="mono text-sm">{distance !== null ? distance.toFixed(2) : '0.00'} km</span>
          </div>
          
          <div className="flex flex-col items-end min-w-[50px]">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">TTL</span>
            <span className={`mono text-sm ${timeLeft < 300000 ? 'text-red-400' : 'text-green-400'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>

          <button 
            onClick={onExit}
            className="p-2 hover:bg-white/5 rounded-full transition"
            title="Leave Zone"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="text-xs text-gray-500 mono uppercase tracking-tighter">
          Encryption Active • Local-Only
        </div>
      )}
    </header>
  );
};

export default Header;
