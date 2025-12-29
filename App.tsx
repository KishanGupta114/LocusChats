
import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { AppState, Zone, User, Message, MediaType, RoomType } from './types';
import { 
  RADIUS_KM, 
  SESSION_DURATION_MS, 
  COLORS, 
  DISCOVERY_TOPIC,
  DISCOVERY_REQ_TOPIC,
  DISCOVERY_PULSE_INTERVAL_MS,
  LOCATION_CHECK_INTERVAL_MS
} from './constants';
import { calculateDistance, getCurrentPosition } from './utils/location';
import { soundService } from './services/soundService';
import JoinScreen from './components/JoinScreen';
import ChatRoom from './components/ChatRoom';
import Header from './components/Header';
import Footer from './components/Footer';

const FINGERPRINT = Math.random().toString(36).substr(2, 12);
const TYPING_EXPIRY_MS = 4000;
const PRESENCE_HEARTBEAT_MS = 10000; 

interface LoadingState {
  active: boolean;
  message: string;
  subMessage?: string;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    currentZone: null,
    currentUser: null,
    isHost: false,
    messages: [],
    isInRange: true,
    distance: null,
    timeLeft: SESSION_DURATION_MS,
    typingUsers: {},
    availableRooms: [],
    userFingerprint: FINGERPRINT,
  });

  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'offline'>('offline');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [roomPassword, setRoomPassword] = useState<string>('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingZone, setPendingZone] = useState<Zone | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [loading, setLoading] = useState<LoadingState>({ active: false, message: '' });

  const mqttClientRef = useRef<any>(null);
  const stateRef = useRef(state);
  const activeMembersRef = useRef<Set<string>>(new Set([FINGERPRINT]));
  const typingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const updateLocation = async () => {
      try {
        const pos = await getCurrentPosition();
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (stateRef.current.currentZone) {
          const d = calculateDistance(pos.coords.latitude, pos.coords.longitude, stateRef.current.currentZone.center.lat, stateRef.current.currentZone.center.lng);
          setState(prev => ({ ...prev, distance: d }));
        }
      } catch (e) {
        console.warn("Location unavailable.");
      }
    };
    updateLocation();
    const locInterval = setInterval(updateLocation, LOCATION_CHECK_INTERVAL_MS);
    return () => clearInterval(locInterval);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zId = params.get('zoneId');
    if (zId) {
      setPendingZone({
        id: zId,
        name: decodeURIComponent(params.get('n') || 'UNNAMED'),
        type: (params.get('t') as RoomType) || 'public',
        hostId: 'remote',
        center: { lat: 0, lng: 0 },
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION_MS,
        userCount: 1
      });
    }
  }, []);

  const handleDiscoveryPulse = (room: Zone) => {
    const now = Date.now();
    if (room.expiresAt <= now) return;
    setState(prev => {
      const isCurrentZone = prev.currentZone?.id === room.id;
      const others = prev.availableRooms.filter(r => r.id !== room.id);
      let inRange = true;
      if (userLocation) {
        const dist = calculateDistance(userLocation.lat, userLocation.lng, room.center.lat, room.center.lng);
        inRange = dist <= RADIUS_KM;
      }
      const updatedRooms = inRange ? [...others, room] : others;
      const updatedCurrentZone = isCurrentZone ? { ...prev.currentZone, userCount: room.userCount } : prev.currentZone;
      return { ...prev, availableRooms: updatedRooms, currentZone: updatedCurrentZone as Zone | null };
    });
  };

  const handleRoomEvent = (data: any) => {
    if (!stateRef.current.currentZone) return;
    const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone.id}`;
    
    switch (data.type) {
      case 'message':
        const msg = data.payload;
        setState(prev => {
          if (prev.messages.some(m => m.id === msg.id)) return prev;
          if (!msg.isSystem && msg.sender !== prev.currentUser?.username) {
            soundService.playReceive();
            setUnreadCount(c => c + 1);
          }
          const newTyping = { ...prev.typingUsers };
          delete newTyping[msg.sender];
          return { ...prev, messages: [...prev.messages, msg], typingUsers: newTyping };
        });
        break;
      case 'typing':
        if (data.sender === stateRef.current.currentUser?.username) return;
        setState(prev => ({ ...prev, typingUsers: { ...prev.typingUsers, [data.sender]: Date.now() } }));
        break;
      case 'presence':
        if (stateRef.current.isHost) activeMembersRef.current.add(data.sender);
        break;
      case 'count_sync':
        setState(prev => prev.currentZone ? ({ ...prev, currentZone: { ...prev.currentZone, userCount: data.count } }) : prev);
        break;
      case 'history_req':
        if (stateRef.current.messages.length > 0) {
          mqttClientRef.current.publish(roomTopic, JSON.stringify({ type: 'history_res', target: data.sender, payload: stateRef.current.messages }));
        }
        break;
      case 'history_res':
        if (data.target === FINGERPRINT) {
          setState(prev => {
            const incoming = data.payload as Message[];
            const existingIds = new Set(prev.messages.map(m => m.id));
            const newMessages = [...prev.messages];
            incoming.forEach(m => { if (!existingIds.has(m.id)) newMessages.push(m); });
            return { ...prev, messages: newMessages.sort((a, b) => a.timestamp - b.timestamp) };
          });
        }
        break;
    }
  };

  useEffect(() => {
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
      clientId: 'locus_' + FINGERPRINT,
      clean: true,
      connectTimeout: 20000,
      reconnectPeriod: 2000,
      protocolVersion: 4,
      path: '/mqtt'
    });

    client.on('connect', () => {
      setConnectionStatus('connected');
      client.subscribe(DISCOVERY_TOPIC);
      client.publish(DISCOVERY_REQ_TOPIC, JSON.stringify({ type: 'sync_req', sender: FINGERPRINT }));
      if (stateRef.current.currentZone) {
        const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone.id}`;
        client.subscribe(roomTopic);
        client.publish(roomTopic, JSON.stringify({ type: 'history_req', sender: FINGERPRINT }));
      }
    });

    client.on('message', (topic, payload) => {
      const data = JSON.parse(payload.toString());
      if (topic === DISCOVERY_TOPIC) handleDiscoveryPulse(data);
      else if (topic === DISCOVERY_REQ_TOPIC && stateRef.current.isHost && data.sender !== FINGERPRINT) broadcastHostZone();
      else if (stateRef.current.currentZone && topic === `locuschat/v2/rooms/${stateRef.current.currentZone.id}`) handleRoomEvent(data);
    });

    mqttClientRef.current = client;
    return () => client && client.end(true);
  }, [state.currentZone?.id]);

  const broadcastHostZone = () => {
    if (!stateRef.current.isHost || !stateRef.current.currentZone || !mqttClientRef.current) return;
    const currentCount = Math.max(1, activeMembersRef.current.size);
    mqttClientRef.current.publish(DISCOVERY_TOPIC, JSON.stringify({ ...stateRef.current.currentZone, userCount: currentCount }));
    mqttClientRef.current.publish(`locuschat/v2/rooms/${stateRef.current.currentZone.id}`, JSON.stringify({ type: 'count_sync', count: currentCount }));
  };

  const hashPassword = async (pwd: string) => {
    const msgUint8 = new TextEncoder().encode(pwd + "locus-salt");
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const refreshDiscovery = () => {
    if (mqttClientRef.current?.connected) {
      setLoading({ active: true, message: "REFRESHING SIGNALS", subMessage: "Broadcasting synchronization request..." });
      mqttClientRef.current.publish(DISCOVERY_REQ_TOPIC, JSON.stringify({ type: 'sync_req', sender: FINGERPRINT }));
      setTimeout(() => setLoading({ active: false, message: "" }), 800);
    }
  };

  const handleBrandClick = () => {
    if (state.currentZone) setShowExitConfirm(true);
    else refreshDiscovery();
  };

  const createRoom = async (name: string, type: RoomType, username: string, password?: string) => {
    setLoading({ active: true, message: "INITIALIZING SENSORS", subMessage: "Requesting geolocation lock..." });
    try {
      const pos = await getCurrentPosition();
      setLoading({ active: true, message: "GENERATING SECURE TUNNEL", subMessage: "Establishing ephemeral frequency..." });
      const now = Date.now();
      const zone: Zone = {
        id: Math.random().toString(36).substr(2, 9),
        name: name.toUpperCase(), type, hostId: FINGERPRINT,
        center: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        createdAt: now, expiresAt: now + SESSION_DURATION_MS, userCount: 1,
        passwordHash: password ? await hashPassword(password) : undefined
      };
      if (password) setRoomPassword(password);
      setTimeout(() => {
        enterZone(zone, username, true);
        setLoading({ active: false, message: "" });
      }, 1000);
    } catch (e) {
      alert("Location required.");
      setLoading({ active: false, message: "" });
    }
  };

  const joinRoom = async (zone: Zone, username: string, password?: string) => {
    setLoading({ active: true, message: "CONNECTING TO SIGNAL", subMessage: "Verifying proximity and credentials..." });
    if (zone.type === 'private' && zone.passwordHash) {
      if (await hashPassword(password || '') !== zone.passwordHash) {
        setLoading({ active: false, message: "" });
        return alert("Access Denied.");
      }
      setRoomPassword(password || '');
    }
    setTimeout(() => {
      enterZone(zone, username, zone.hostId === FINGERPRINT);
      setLoading({ active: false, message: "" });
    }, 1000);
  };

  const enterZone = (zone: Zone, username: string, isHost: boolean) => {
    const newUser: User = { username: username.toUpperCase(), color: COLORS[Math.floor(Math.random() * COLORS.length)] };
    setState(prev => ({ ...prev, currentZone: zone, currentUser: newUser, isHost, messages: [], timeLeft: zone.expiresAt - Date.now() }));
    setUnreadCount(0);
    setPendingZone(null);
    if (mqttClientRef.current?.connected) {
      const roomTopic = `locuschat/v2/rooms/${zone.id}`;
      mqttClientRef.current.publish(roomTopic, JSON.stringify({ 
        type: 'message', 
        payload: { id: `sys_join_${Date.now()}`, sender: newUser.username, timestamp: Date.now(), isSystem: true, systemType: 'join', type: 'system' } 
      }));
      mqttClientRef.current.publish(roomTopic, JSON.stringify({ type: 'history_req', sender: FINGERPRINT }));
    }
  };

  const handleExit = async () => {
    if (mqttClientRef.current?.connected && state.currentZone && state.currentUser) {
      const roomTopic = `locuschat/v2/rooms/${state.currentZone.id}`;
      mqttClientRef.current.publish(roomTopic, JSON.stringify({ 
        type: 'message', 
        payload: { id: `sys_leave_${Date.now()}`, sender: state.currentUser.username, timestamp: Date.now(), isSystem: true, systemType: 'leave', type: 'system' } 
      }));
    }
    setLoading({ active: true, message: "COLLAPSING TUNNEL", subMessage: "Scrubbing transient RAM buffers..." });
    setState(prev => ({ ...prev, currentZone: null, currentUser: null, messages: [], isHost: false, timeLeft: SESSION_DURATION_MS }));
    setRoomPassword('');
    setShowExitConfirm(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('zoneId');
    window.history.replaceState({}, '', url.toString());
    setTimeout(() => setLoading({ active: false, message: "" }), 800);
  };

  const sendMessage = async (text: string, type: MediaType = 'text', mediaData?: string) => {
    if (!state.currentUser || !state.currentZone || !mqttClientRef.current) return;
    const msg: Message = { id: Math.random().toString(36).substr(2, 9), sender: state.currentUser.username, text, timestamp: Date.now(), type, mediaData };
    mqttClientRef.current.publish(`locuschat/v2/rooms/${state.currentZone.id}`, JSON.stringify({ type: 'message', payload: msg }));
    soundService.playSend();
  };

  return (
    <div className="fixed inset-0 w-full flex flex-col bg-[#0a0a0a] text-gray-100 overflow-hidden">
      {loading.active && (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="max-w-xs w-full flex flex-col items-center">
            <div className="w-full h-1 bg-white/5 rounded-full mb-8 overflow-hidden relative">
              <div className="absolute inset-y-0 bg-white animate-loading-bar w-1/3"></div>
            </div>
            <h2 className="text-white text-[11px] font-black uppercase tracking-[0.4em] mb-3 text-center animate-pulse">{loading.message}</h2>
            <p className="text-gray-600 text-[9px] font-bold uppercase tracking-widest text-center mono">{loading.subMessage || 'Please Wait'}</p>
          </div>
        </div>
      )}

      <Header 
        zone={state.currentZone} timeLeft={state.timeLeft} status={connectionStatus}
        isHost={state.isHost} password={roomPassword} unreadCount={unreadCount}
        onExitRequest={() => setShowExitConfirm(true)} onShare={() => {}} 
        onBrandClick={handleBrandClick}
      />
      
      <main className="flex-1 relative overflow-hidden flex flex-col bg-[#0a0a0a]">
        {!state.currentZone ? (
          <>
            <JoinScreen onJoin={joinRoom} onCreate={createRoom} rooms={state.availableRooms} deepLinkedZone={pendingZone} isLoading={loading.active} />
            <Footer status={connectionStatus} timeLeft={state.timeLeft} totalTime={SESSION_DURATION_MS} distance={state.distance} fingerprint={FINGERPRINT} />
          </>
        ) : (
          <ChatRoom messages={state.messages} currentUser={state.currentUser} typingUsers={state.typingUsers} onSendMessage={sendMessage} onTyping={() => {}} onRead={() => setUnreadCount(0)} />
        )}
      </main>

      {showExitConfirm && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-in fade-in duration-300">
           <div className="max-w-xs w-full glass border border-white/10 rounded-[2.5rem] p-8 text-center flex flex-col items-center">
              <h2 className="text-xl font-bold mb-3 text-white">Leave Zone?</h2>
              <p className="text-gray-400 text-[10px] leading-relaxed mb-8 mono uppercase tracking-widest text-center">Local chat buffer will be cleared.</p>
              <div className="flex flex-col w-full gap-3">
                <button onClick={handleExit} className="w-full py-4 bg-white/10 text-white font-black rounded-2xl uppercase tracking-widest text-[10px]">Exit Now</button>
                <button onClick={() => setShowExitConfirm(false)} className="w-full py-4 bg-white text-black font-black rounded-2xl uppercase tracking-widest text-[10px]">Cancel</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
