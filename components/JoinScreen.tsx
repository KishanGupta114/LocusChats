
import React, { useEffect, useState } from 'react';
import { getPrivacyAdvice } from '../services/geminiService';
import { Zone, RoomType } from '../types';
import { calculateDistance, getDistanceLabel, getCurrentPosition } from '../utils/location';

interface JoinScreenProps {
  onJoin: (room: Zone, username: string, password?: string) => void;
  onCreate: (name: string, type: RoomType, username: string, password?: string) => void;
  rooms: Zone[];
  deepLinkedZone?: Zone | null;
  isLoading?: boolean;
  defaultHandle?: string;
}

const JoinScreen: React.FC<JoinScreenProps> = ({ onJoin, onCreate, rooms, deepLinkedZone, isLoading = false, defaultHandle = '' }) => {
  const [advice, setAdvice] = useState<string>("Initializing secure discovery...");
  const [view, setView] = useState<'browse' | 'create'>('browse');
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  
  // Create Flow state
  const [newUsername, setNewUsername] = useState(defaultHandle);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<RoomType>('public');
  const [newPass, setNewPass] = useState('');

  // Join Flow state
  const [selectedRoom, setSelectedRoom] = useState<Zone | null>(null);
  const [joinUsername, setJoinUsername] = useState(defaultHandle);
  const [joinPass, setJoinPass] = useState('');

  useEffect(() => {
    getPrivacyAdvice().then(setAdvice);
    getCurrentPosition().then(pos => {
      setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    }).catch(() => {});
  }, []);

  // Effect to handle deep linking auto-selection instantly
  useEffect(() => {
    if (deepLinkedZone && !selectedRoom) {
      setSelectedRoom(deepLinkedZone);
    }
  }, [deepLinkedZone, selectedRoom]);

  const handleCreate = () => {
    if (isLoading) return;
    if (!newUsername.trim()) return alert("Handle required for identification.");
    if (!newName.trim()) return alert("Zone name required.");
    if (newType === 'private' && !newPass) return alert("Access Key required for private zones.");
    onCreate(newName, newType, newUsername, newPass);
  };

  const handleJoinFinal = () => {
    if (isLoading || !selectedRoom) return;
    if (!joinUsername.trim()) return alert("Please set your handle first.");
    if (selectedRoom.type === 'private' && !joinPass) return alert("Password required.");
    onJoin(selectedRoom, joinUsername, joinPass);
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 flex flex-col items-center">
      <div className="max-w-md w-full">
        {/* App Meta Section */}
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-black tracking-tighter mb-4 text-white uppercase">Locus Chat</h2>
          <div className="space-y-3 px-4">
            <p className="text-gray-400 text-xs font-medium leading-relaxed">
              Connect anonymously with others within a <span className="text-white">10km radius</span>.
            </p>
            <p className="text-gray-500 text-[10px] mono uppercase tracking-widest leading-relaxed">
              2 Hour Session Limit • Zero Data Retention • Peer Discovery • End-to-End Tunneling
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl mb-8 border border-white/5">
          <button 
            onClick={() => setView('browse')}
            disabled={isLoading}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'browse' ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'} disabled:opacity-50`}
          >
            Discovery List
          </button>
          <button 
            onClick={() => setView('create')}
            disabled={isLoading}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'create' ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white'} disabled:opacity-50`}
          >
            Initialize Zone
          </button>
        </div>

        {view === 'browse' ? (
          <div className="space-y-4">
            {rooms.length === 0 ? (
              <div className="py-20 text-center border border-dashed border-white/10 rounded-[2.5rem] bg-white/[0.02]">
                <div className="mb-4 text-gray-700">
                  <svg className="w-12 h-12 mx-auto opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 21l-8.228-9.917A17.598 17.598 0 0114.503 3a17.598 17.598 0 0110.731 8.083L12 21z" />
                  </svg>
                </div>
                <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest">Scanning for active signals...</p>
                <p className="text-gray-800 text-[9px] mono mt-2">Zero zones found in 10km radius.</p>
              </div>
            ) : (
              rooms.map(room => {
                const dist = userCoords ? calculateDistance(userCoords.lat, userCoords.lng, room.center.lat, room.center.lng) : 0;
                return (
                  <button 
                    key={room.id}
                    onClick={() => !isLoading && setSelectedRoom(room)}
                    disabled={isLoading}
                    className="w-full text-left glass border border-white/10 p-5 rounded-3xl flex items-center justify-between hover:border-white/30 transition-all active:scale-98 disabled:opacity-50"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-black tracking-tight uppercase text-white">{room.name}</span>
                        {room.type === 'private' && (
                          <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                        )}
                      </div>
                      <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                        {getDistanceLabel(dist)} • {room.userCount || 1} {room.userCount === 1 ? 'MEMBER' : 'MEMBERS'}
                      </span>
                    </div>
                    <div className="text-[9px] font-bold text-white/20 uppercase tracking-widest mono">
                      {Math.max(0, Math.floor((room.expiresAt - Date.now()) / 60000))}M LEFT
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="glass border border-white/10 p-8 rounded-[2.5rem] space-y-6 animate-in slide-in-from-bottom duration-300">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2 block">Your Handle</label>
              <input 
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                disabled={isLoading}
                placeholder="E.G. GHOST_SIGNAL"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-white/30 text-white font-bold uppercase disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2 block">Zone Identity</label>
              <input 
                value={newName}
                onChange={e => setNewName(e.target.value)}
                disabled={isLoading}
                placeholder="E.G. DATA_BUNKER"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-white/30 text-white font-bold uppercase disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2 block">Zone Visibility</label>
              <div className="flex gap-2">
                <button onClick={() => setNewType('public')} disabled={isLoading} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${newType === 'public' ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-gray-500'} disabled:opacity-50`}>Public</button>
                <button onClick={() => setNewType('private')} disabled={isLoading} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${newType === 'private' ? 'bg-red-500 text-white shadow-lg' : 'bg-white/5 text-gray-500'} disabled:opacity-50`}>Private</button>
              </div>
            </div>
            {newType === 'private' && (
              <div className="animate-in fade-in slide-in-from-top duration-300">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2 block">Access Password</label>
                <input 
                  type="password"
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  disabled={isLoading}
                  placeholder="MIN 4 CHARACTERS"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-white/30 text-white font-bold disabled:opacity-50"
                />
              </div>
            )}
            <button 
              onClick={handleCreate} 
              disabled={isLoading}
              className="w-full py-5 bg-white text-black font-black uppercase tracking-widest text-[11px] rounded-2xl active:scale-95 transition-all shadow-xl disabled:opacity-50"
            >
              Initialize Zone
            </button>
          </div>
        )}

        {/* Universal Join Modal (Username + Password) */}
        {selectedRoom && (
          <div className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="max-w-xs w-full glass border border-white/10 p-8 rounded-[2.5rem] text-center shadow-2xl animate-in zoom-in duration-300">
              <div className="mb-6">
                <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight text-white mb-1">{selectedRoom.name}</h3>
                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{selectedRoom.type} Zone</p>
              </div>

              <div className="space-y-4 mb-8">
                <div>
                  <label className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-600 mb-2 block text-left px-1">Your Handle</label>
                  <input 
                    autoFocus
                    value={joinUsername}
                    onChange={e => setJoinUsername(e.target.value)}
                    disabled={isLoading}
                    placeholder="ENTER HANDLE"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-white/30 text-center text-white font-bold uppercase text-sm disabled:opacity-50"
                  />
                </div>
                
                {selectedRoom.type === 'private' && (
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-600 mb-2 block text-left px-1">Access Key</label>
                    <input 
                      type="password"
                      value={joinPass}
                      onChange={e => setJoinPass(e.target.value)}
                      disabled={isLoading}
                      placeholder="PASSWORD"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-white/30 text-center text-white font-bold text-sm disabled:opacity-50"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleJoinFinal} 
                  disabled={isLoading}
                  className="w-full py-4 bg-white text-black font-black uppercase tracking-widest text-[10px] rounded-xl active:scale-95 shadow-xl transition-all disabled:opacity-50"
                >
                  Verify & Enter
                </button>
                <button 
                  onClick={() => { if(!isLoading) { setSelectedRoom(null); setJoinUsername(defaultHandle); setJoinPass(''); } }} 
                  disabled={isLoading}
                  className="w-full py-4 bg-white/5 text-gray-500 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-white/10 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-16 text-center">
          <p className="text-[10px] text-gray-700 mono italic max-w-xs mx-auto leading-relaxed opacity-60">
            &ldquo;{advice}&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
};

export default JoinScreen;
