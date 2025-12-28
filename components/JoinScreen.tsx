
import React, { useEffect, useState } from 'react';
import { getPrivacyAdvice } from '../services/geminiService';
import { Zone, RoomType } from '../types';

interface JoinScreenProps {
  onJoin: (room: Zone, password?: string) => void;
  onCreate: (name: string, type: RoomType, password?: string) => void;
  rooms: Zone[];
}

const JoinScreen: React.FC<JoinScreenProps> = ({ onJoin, onCreate, rooms }) => {
  const [advice, setAdvice] = useState<string>("Initializing secure discovery...");
  const [view, setView] = useState<'browse' | 'create'>('browse');
  
  // Creation Form State
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<RoomType>('public');
  const [newPass, setNewPass] = useState('');

  // Password Prompt State
  const [selectedRoom, setSelectedRoom] = useState<Zone | null>(null);
  const [joinPass, setJoinPass] = useState('');

  useEffect(() => {
    getPrivacyAdvice().then(setAdvice);
  }, []);

  const handleCreate = () => {
    if (!newName.trim()) return alert("Room name required.");
    if (newType === 'private' && !newPass) return alert("Password required for private rooms.");
    onCreate(newName, newType, newPass);
  };

  const handleJoinRequest = (room: Zone) => {
    if (room.type === 'private') {
      setSelectedRoom(room);
    } else {
      onJoin(room);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 flex flex-col items-center">
      <div className="max-w-md w-full">
        {/* Header Section */}
        <div className="text-center mb-10">
          <div className="inline-block p-4 bg-white/5 rounded-3xl mb-6 border border-white/5 shadow-2xl">
            <svg className="w-10 h-10 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
            </svg>
          </div>
          <h2 className="text-3xl font-black tracking-tighter mb-3">LOCUS RADIUS</h2>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-[0.2em]">{rooms.length} Active Zones Nearby</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl mb-8 border border-white/5">
          <button 
            onClick={() => setView('browse')}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'browse' ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
          >
            Discovery
          </button>
          <button 
            onClick={() => setView('create')}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'create' ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}
          >
            New Zone
          </button>
        </div>

        {/* Discovery Feed */}
        {view === 'browse' && (
          <div className="space-y-4">
            {rooms.length === 0 ? (
              <div className="py-20 text-center glass border border-dashed border-white/10 rounded-3xl">
                <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest mb-4">No Signals Detected</p>
                <button onClick={() => setView('create')} className="text-white text-xs font-bold underline">Initialize the first Zone</button>
              </div>
            ) : (
              rooms.sort((a,b) => b.createdAt - a.createdAt).map(room => (
                <button 
                  key={room.id}
                  onClick={() => handleJoinRequest(room)}
                  className="w-full text-left glass border border-white/10 p-5 rounded-3xl hover:border-white/30 transition-all active:scale-98 group flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-black tracking-tight">{room.name}</span>
                      {room.type === 'private' && (
                        <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                      )}
                    </div>
                    <div className="flex gap-3 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                      <span>{Math.floor((room.expiresAt - Date.now()) / 60000)}M Left</span>
                      <span>•</span>
                      <span>{room.userCount || 1} Active</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Create Flow */}
        {view === 'create' && (
          <div className="glass border border-white/10 p-8 rounded-[2.5rem] animate-in fade-in zoom-in duration-300">
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2 block">Zone Identity</label>
                <input 
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="E.G. UNDERGROUND"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-white/30 text-white font-bold tracking-tight uppercase"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2 block">Visibility</label>
                <div className="flex gap-2">
                  <button onClick={() => setNewType('public')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${newType === 'public' ? 'bg-white text-black' : 'bg-white/5 text-gray-500'}`}>Public</button>
                  <button onClick={() => setNewType('private')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${newType === 'private' ? 'bg-red-500 text-white' : 'bg-white/5 text-gray-500'}`}>Private</button>
                </div>
              </div>

              {newType === 'private' && (
                <div className="animate-in slide-in-from-top duration-300">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2 block">Access Key</label>
                  <input 
                    type="password"
                    value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    placeholder="MIN 4 CHARACTERS"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-white/30 text-white font-bold"
                  />
                </div>
              )}

              <button 
                onClick={handleCreate}
                className="w-full py-5 bg-white text-black font-black uppercase tracking-[0.2em] text-[11px] rounded-2xl hover:scale-102 active:scale-95 transition-all shadow-xl"
              >
                Launch Tunnel
              </button>
            </div>
          </div>
        )}

        {/* Password Join Modal */}
        {selectedRoom && (
          <div className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
            <div className="max-w-xs w-full glass border border-white/10 p-8 rounded-[2.5rem] text-center shadow-2xl">
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <h3 className="text-xl font-black mb-2 uppercase tracking-tight">{selectedRoom.name}</h3>
              <p className="text-gray-500 text-[9px] font-black uppercase tracking-widest mb-8 italic">Restricted Access Zone</p>
              
              <input 
                type="password"
                autoFocus
                value={joinPass}
                onChange={e => setJoinPass(e.target.value)}
                placeholder="ACCESS KEY"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 mb-6 focus:outline-none focus:border-white/30 text-center font-bold"
              />

              <div className="flex flex-col gap-3">
                <button onClick={() => onJoin(selectedRoom, joinPass)} className="w-full py-4 bg-white text-black font-black uppercase tracking-widest text-[10px] rounded-2xl">Verify & Join</button>
                <button onClick={() => { setSelectedRoom(null); setJoinPass(''); }} className="w-full py-4 bg-white/5 text-gray-500 font-black uppercase tracking-widest text-[10px] rounded-2xl">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Privacy Advice */}
        <div className="mt-12 text-center">
          <p className="text-[10px] text-gray-700 mono italic max-w-xs mx-auto leading-relaxed border-t border-white/5 pt-8">
            &ldquo;{advice}&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
};

export default JoinScreen;
