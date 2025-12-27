
import React, { useEffect, useState } from 'react';
import { getPrivacyAdvice } from '../services/geminiService';
import { Zone } from '../types';

interface JoinScreenProps {
  onJoin: () => void;
  invitedZone: Zone | null;
}

const JoinScreen: React.FC<JoinScreenProps> = ({ onJoin, invitedZone }) => {
  const [advice, setAdvice] = useState<string>("Verifying encrypted tunnel...");

  useEffect(() => {
    getPrivacyAdvice().then(setAdvice);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10">
      <div className="flex flex-col items-center justify-center min-h-full max-w-2xl mx-auto text-center">
        <div className="mb-8 relative">
          <div className="w-24 h-24 sm:w-32 sm:h-32 bg-white/5 rounded-full flex items-center justify-center animate-pulse-slow">
              <svg className="w-12 h-12 sm:w-16 sm:h-16 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
          </div>
          <div className="absolute -inset-4 bg-white/5 blur-3xl -z-10 rounded-full"></div>
        </div>

        {invitedZone ? (
          <div className="mb-6 inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Invited to Zone {invitedZone.id.slice(0, 4)}</span>
          </div>
        ) : null}

        <h2 className="text-3xl sm:text-4xl font-bold mb-4 tracking-tight">
          {invitedZone ? "Join Existing Zone" : "Temporary Presence. Zero Footprint."}
        </h2>
        <p className="text-gray-400 text-base sm:text-lg mb-8 leading-relaxed">
          {invitedZone 
            ? "A shared zone link was detected. We will verify your location to ensure you are within the 2km radius."
            : "Join an anonymous conversation with people within 2 kilometers. Your identity is random. Your messages are ephemeral. Your data is never stored."
          }
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 w-full mb-8">
          <div className="p-4 glass rounded-2xl">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Distance</h3>
            <p className="text-lg font-semibold">2 KM Radius</p>
          </div>
          <div className="p-4 glass rounded-2xl">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Lifespan</h3>
            <p className="text-lg font-semibold">60 Minutes</p>
          </div>
          <div className="p-4 glass rounded-2xl">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Identity</h3>
            <p className="text-lg font-semibold">Pure Random</p>
          </div>
        </div>

        <button 
          onClick={onJoin}
          className="group relative px-10 py-4 bg-white text-black font-bold rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)] mb-10"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
          {invitedZone ? "Verify Location & Join" : "Enter Locus Chat"}
        </button>

        <div className="w-full p-4 border border-white/5 rounded-xl bg-white/[0.02] mb-6">
          <p className="text-[11px] text-gray-500 mono italic leading-tight">
            &ldquo;{advice}&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
};

export default JoinScreen;
