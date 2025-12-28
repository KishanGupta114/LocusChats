
import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { AppState, Zone, User, Message, MediaType, RoomType } from './types';
import { 
  RADIUS_KM, 
  SESSION_DURATION_MS, 
  ADJECTIVES, 
  NOUNS, 
  COLORS, 
  LOCATION_CHECK_INTERVAL_MS,
  DISCOVERY_TOPIC,
  DISCOVERY_PULSE_INTERVAL_MS
} from './constants';
import { calculateDistance, getCurrentPosition } from './utils/location';
import { soundService } from './services/soundService';
import JoinScreen from './components/JoinScreen';
import ChatRoom from './components/ChatRoom';
import Header from './components/Header';
import ExpiryWarning from './components/ExpiryWarning';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    currentZone: null,
    currentUser: null,
    messages: [],
    isInRange: true,
    distance: null,
    timeLeft: SESSION_DURATION_MS,
    typingUsers: {},
    availableRooms: [],
  });

  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'offline'>('offline');
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [roomPassword, setRoomPassword] = useState<string>('');
  
  const mqttClientRef = useRef<any>(null);
  const stateRef = useRef(state);
  const typingTimeoutRef = useRef<any>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const warningShownRef = useRef(false);

  // Discovery Management
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Main Connection for Discovery and Chat
  useEffect(() => {
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
      clientId: 'locus_' + Math.random().toString(16).substr(2, 8),
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 2000,
    });

    client.on('connect', () => {
      setConnectionStatus('connected');
      client.subscribe(DISCOVERY_TOPIC);
      if (state.currentZone) {
        client.subscribe(`locuschat/v2/rooms/${state.currentZone.id}`);
      }
    });

    client.on('message', async (topic, payload) => {
      const data = JSON.parse(payload.toString());

      if (topic === DISCOVERY_TOPIC) {
        handleDiscoveryPulse(data);
      } else if (stateRef.current.currentZone && topic === `locuschat/v2/rooms/${stateRef.current.currentZone.id}`) {
        handleIncomingMessage(data);
      }
    });

    mqttClientRef.current = client;
    return () => client.end();
  }, [state.currentZone?.id]);

  const handleDiscoveryPulse = async (room: Zone) => {
    try {
      const pos = await getCurrentPosition();
      const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, room.center.lat, room.center.lng);
      
      if (dist <= RADIUS_KM && room.expiresAt > Date.now()) {
        setState(prev => {
          const others = prev.availableRooms.filter(r => r.id !== room.id);
          return { ...prev, availableRooms: [...others, { ...room, userCount: room.userCount || 1 }] };
        });
      }
    } catch (e) { /* Location denied - silent */ }
  };

  const handleIncomingMessage = (data: any) => {
    if (data.type === 'typing') {
      if (data.sender === stateRef.current.currentUser?.username) return;
      setState(prev => ({
        ...prev,
        typingUsers: { ...prev.typingUsers, [data.sender]: Date.now() }
      }));
    } else {
      const msg = data.payload;
      setState(prev => {
        if (prev.messages.some(m => m.id === msg.id)) return prev;
        if (msg.sender !== prev.currentUser?.username) soundService.playReceive();
        const newTyping = { ...prev.typingUsers };
        delete newTyping[msg.sender];
        return { ...prev, messages: [...prev.messages, msg], typingUsers: newTyping };
      });
    }
  };

  // Heartbeat to keep room in discovery feed
  useEffect(() => {
    if (!state.currentZone || !mqttClientRef.current) return;
    const pulse = setInterval(() => {
      const pulseData = { ...state.currentZone, userCount: Object.keys(state.typingUsers).length + 1 };
      mqttClientRef.current.publish(DISCOVERY_TOPIC, JSON.stringify(pulseData));
    }, DISCOVERY_PULSE_INTERVAL_MS);
    return () => clearInterval(pulse);
  }, [state.currentZone]);

  const hashPassword = async (pwd: string) => {
    const msgUint8 = new TextEncoder().encode(pwd + "locus-salt");
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const createRoom = async (name: string, type: RoomType, password?: string) => {
    const pos = await getCurrentPosition();
    const now = Date.now();
    const id = Math.random().toString(36).substr(2, 9);
    
    const zone: Zone = {
      id,
      name: name.toUpperCase(),
      type,
      center: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      createdAt: now,
      expiresAt: now + SESSION_DURATION_MS,
      userCount: 1,
      passwordHash: type === 'private' && password ? await hashPassword(password) : undefined
    };

    if (type === 'private') setRoomPassword(password || '');
    joinZone(zone, true);
  };

  const joinRoom = async (zone: Zone, password?: string) => {
    if (zone.type === 'private' && zone.passwordHash) {
      const inputHash = await hashPassword(password || '');
      if (inputHash !== zone.passwordHash) {
        alert("Invalid Access Key.");
        return;
      }
      setRoomPassword(password || '');
    }
    joinZone(zone, false);
  };

  const joinZone = (zone: Zone, isHost: boolean) => {
    const newUser: User = {
      username: `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`.toUpperCase(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    };

    setState(prev => ({
      ...prev,
      currentZone: zone,
      currentUser: newUser,
      messages: [{
        id: 'sys-' + Date.now(),
        sender: 'System',
        text: `${zone.name} ESTABLISHED. TTL: 120M.`,
        timestamp: Date.now(),
        isSystem: true,
        type: 'text'
      }],
      timeLeft: zone.expiresAt - Date.now(),
    }));
  };

  const handleExit = () => {
    setState(prev => ({
      ...prev,
      currentZone: null, currentUser: null, messages: [],
      timeLeft: SESSION_DURATION_MS, typingUsers: {},
    }));
    setShowExitConfirm(false);
    setRoomPassword('');
  };

  const sendMessage = async (text: string, type: MediaType = 'text', mediaData?: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!state.currentUser || !state.currentZone || !mqttClientRef.current) return reject();
      
      const msg: Message = {
        id: Math.random().toString(36).substr(2, 9),
        sender: state.currentUser.username,
        text,
        timestamp: Date.now(),
        type,
        mediaData
      };

      const topic = `locuschat/v2/rooms/${state.currentZone.id}`;
      mqttClientRef.current.publish(topic, JSON.stringify({ type: 'message', payload: msg }), (err: any) => {
        if (err) reject(err);
        else {
          soundService.playSend();
          resolve();
        }
      });
    });
  };

  const broadcastTyping = () => {
    if (!state.currentUser || !state.currentZone || !mqttClientRef.current || typingTimeoutRef.current) return;
    const topic = `locuschat/v2/rooms/${state.currentZone.id}`;
    mqttClientRef.current.publish(topic, JSON.stringify({ type: 'typing', sender: state.currentUser.username }));
    typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 2000);
  };

  return (
    <div ref={appRef} className="fixed inset-0 w-full flex flex-col bg-[#0a0a0a] text-gray-100 overflow-hidden">
      <Header 
        zone={state.currentZone} 
        timeLeft={state.timeLeft} 
        distance={state.distance}
        status={connectionStatus}
        onExitRequest={() => setShowExitConfirm(true)}
      />
      
      <main className="flex-1 relative overflow-hidden flex flex-col bg-[#0a0a0a]">
        {!state.currentZone ? (
          <JoinScreen 
            onJoin={joinRoom} 
            onCreate={createRoom} 
            rooms={state.availableRooms} 
          />
        ) : (
          <ChatRoom 
            messages={state.messages} 
            currentUser={state.currentUser} 
            typingUsers={state.typingUsers}
            onSendMessage={sendMessage}
            onTyping={broadcastTyping}
          />
        )}
      </main>

      {showExitConfirm && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-in fade-in duration-300">
           <div className="max-w-xs w-full glass border border-white/10 rounded-[2.5rem] p-8 text-center flex flex-col items-center shadow-2xl">
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <h2 className="text-xl font-bold mb-3 text-white">Sever Session?</h2>
              <p className="text-gray-400 text-[10px] leading-relaxed mb-8 mono uppercase tracking-[0.2em]">All volatile memory will be purged immediately.</p>
              <div className="flex flex-col w-full gap-3">
                <button onClick={handleExit} className="w-full py-4 bg-red-500 text-white font-black rounded-2xl active:scale-95 uppercase tracking-widest text-[10px]">Purge & Exit</button>
                <button onClick={() => setShowExitConfirm(false)} className="w-full py-4 bg-white/5 text-gray-400 font-black rounded-2xl hover:bg-white/10 active:scale-95 uppercase tracking-widest text-[10px]">Cancel</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
