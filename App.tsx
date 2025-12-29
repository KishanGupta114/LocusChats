
import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { AppState, Zone, User, Message, MediaType, RoomType } from './types';
import { 
  RADIUS_KM, 
  SESSION_DURATION_MS, 
  COLORS, 
  DISCOVERY_TOPIC,
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
  const [pendingZoneId, setPendingZoneId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  
  const [loading, setLoading] = useState<LoadingState>({ active: false, message: '' });

  const mqttClientRef = useRef<any>(null);
  const stateRef = useRef(state);
  const activeMembersRef = useRef<Set<string>>(new Set([FINGERPRINT]));
  const typingTimeoutRef = useRef<any>(null);
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const updateLocation = async () => {
      try {
        const pos = await getCurrentPosition();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng });

        if (stateRef.current.currentZone) {
          const d = calculateDistance(lat, lng, stateRef.current.currentZone.center.lat, stateRef.current.currentZone.center.lng);
          setState(prev => ({ ...prev, distance: d }));
        }
      } catch (e) {
        console.warn("Location access denied or unavailable.");
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
      setPendingZoneId(zId);
    }
  }, []);

  useEffect(() => {
    if (!state.currentZone) return;

    const interval = setInterval(() => {
      setState(prev => {
        if (!prev.currentZone) return prev;
        const remaining = prev.currentZone.expiresAt - Date.now();
        if (remaining <= 0) {
          clearInterval(interval);
          alert("Session expired. This zone has been decommissioned.");
          setTimeout(handleExit, 0);
          return { ...prev, timeLeft: 0 };
        }
        return { ...prev, timeLeft: remaining };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.currentZone?.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const currentLocation = userLocation; 

      setState(prev => {
        let changed = false;
        const newTyping = { ...prev.typingUsers };
        Object.keys(newTyping).forEach(username => {
          if (now - newTyping[username] > TYPING_EXPIRY_MS) {
            delete newTyping[username];
            changed = true;
          }
        });

        const filteredRooms = prev.availableRooms.filter(room => {
          const isExpired = room.expiresAt <= now;
          if (isExpired) return false;
          
          if (currentLocation) {
            const dist = calculateDistance(currentLocation.lat, currentLocation.lng, room.center.lat, room.center.lng);
            return dist <= RADIUS_KM;
          }
          return true;
        });

        if (filteredRooms.length !== prev.availableRooms.length) {
          changed = true;
        }

        return changed ? { ...prev, typingUsers: newTyping, availableRooms: filteredRooms } : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [userLocation]);

  useEffect(() => {
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
      clientId: 'locus_' + FINGERPRINT,
      clean: true,
      connectTimeout: 30000, 
      reconnectPeriod: 1000, 
      keepalive: 60,
      reschedulePings: true, 
    });

    client.on('connect', () => {
      setConnectionStatus('connected');
      client.subscribe(DISCOVERY_TOPIC);
      if (stateRef.current.currentZone) {
        const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone.id}`;
        client.subscribe(roomTopic);
        client.publish(roomTopic, JSON.stringify({ type: 'history_req', sender: FINGERPRINT }));
        client.publish(roomTopic, JSON.stringify({ type: 'presence', sender: FINGERPRINT }));
      }
    });

    client.on('reconnect', () => setConnectionStatus('reconnecting'));
    client.on('offline', () => setConnectionStatus('offline'));
    client.on('error', (err: any) => {
      console.error("MQTT Error:", err.message);
      if (err.message && (err.message.includes('timeout') || err.message.includes('Keepalive'))) {
        setConnectionStatus('reconnecting');
      }
    });

    client.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString());
        if (topic === DISCOVERY_TOPIC) {
          handleDiscoveryPulse(data);
        } else if (stateRef.current.currentZone && topic === `locuschat/v2/rooms/${stateRef.current.currentZone.id}`) {
          handleRoomEvent(data);
        }
      } catch (e) {
        console.error("Payload parsing error", e);
      }
    });

    mqttClientRef.current = client;
    return () => client.end();
  }, [state.currentZone?.id]);

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

      return { 
        ...prev, 
        availableRooms: updatedRooms,
        currentZone: updatedCurrentZone as Zone | null
      };
    });
  };

  const handleRoomEvent = (data: any) => {
    const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone?.id}`;
    
    switch (data.type) {
      case 'message':
        const msg = data.payload;
        setState(prev => {
          if (prev.messages.some(m => m.id === msg.id)) return prev;
          const newTyping = { ...prev.typingUsers };
          delete newTyping[msg.sender];
          if (msg.sender !== prev.currentUser?.username) {
            soundService.playReceive();
            setUnreadCount(c => c + 1);
          }
          return { ...prev, messages: [...prev.messages, msg], typingUsers: newTyping };
        });
        break;
      case 'typing':
        if (data.sender === stateRef.current.currentUser?.username) return;
        setState(prev => ({ 
          ...prev, 
          typingUsers: { ...prev.typingUsers, [data.sender]: Date.now() } 
        }));
        break;
      case 'presence':
        if (stateRef.current.isHost) activeMembersRef.current.add(data.sender);
        break;
      case 'count_sync':
        setState(prev => {
          if (prev.currentZone && prev.currentZone.id === stateRef.current.currentZone?.id) {
            return { ...prev, currentZone: { ...prev.currentZone, userCount: data.count } };
          }
          return prev;
        });
        break;
      case 'history_req':
        if (stateRef.current.messages.length > 0) {
          mqttClientRef.current.publish(roomTopic, JSON.stringify({ 
            type: 'history_res', target: data.sender, payload: stateRef.current.messages
          }));
        }
        break;
      case 'history_res':
        if (data.target === FINGERPRINT) {
          setState(prev => {
            const incomingMessages = data.payload as Message[];
            const existingIds = new Set(prev.messages.map(m => m.id));
            const newMessages = [...prev.messages];
            incomingMessages.forEach(msg => { if (!existingIds.has(msg.id)) newMessages.push(msg); });
            return { ...prev, messages: newMessages.sort((a, b) => a.timestamp - b.timestamp) };
          });
        }
        break;
      case 'room_delete':
        alert("This Zone has been decommissioned.");
        handleExit();
        break;
    }
  };

  useEffect(() => {
    if (!state.currentZone || !mqttClientRef.current) return;
    const pulse = setInterval(() => {
      const currentCount = Math.max(1, activeMembersRef.current.size);
      if (stateRef.current.isHost) {
        setState(prev => prev.currentZone ? ({ ...prev, currentZone: { ...prev.currentZone, userCount: currentCount } }) : prev);
        const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone?.id}`;
        mqttClientRef.current.publish(DISCOVERY_TOPIC, JSON.stringify({ ...stateRef.current.currentZone, userCount: currentCount }));
        mqttClientRef.current.publish(roomTopic, JSON.stringify({ type: 'count_sync', count: currentCount }));
        activeMembersRef.current = new Set([FINGERPRINT]);
      }
    }, DISCOVERY_PULSE_INTERVAL_MS);
    return () => clearInterval(pulse);
  }, [state.currentZone?.id, state.isHost]);

  useEffect(() => {
    if (!state.currentZone || !mqttClientRef.current) return;
    const hb = setInterval(() => {
      const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone?.id}`;
      mqttClientRef.current.publish(roomTopic, JSON.stringify({ type: 'presence', sender: FINGERPRINT }));
    }, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(hb);
  }, [state.currentZone?.id]);

  const hashPassword = async (pwd: string) => {
    const msgUint8 = new TextEncoder().encode(pwd + "locus-salt");
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const createRoom = async (name: string, type: RoomType, username: string, password?: string) => {
    setLoading({ active: true, message: "INITIALIZING SENSORS", subMessage: "Requesting geolocation lock..." });
    try {
      const pos = await getCurrentPosition();
      setLoading(l => ({ ...l, message: "GENERATING SECURE TUNNEL", subMessage: "Establishing ephemeral frequency..." }));
      await new Promise(resolve => setTimeout(resolve, 800));
      const now = Date.now();
      const id = Math.random().toString(36).substr(2, 9);
      const pwdHash = (type === 'private' && password) ? await hashPassword(password) : undefined;
      const zone: Zone = {
        id, name: name.toUpperCase(), type, hostId: FINGERPRINT,
        center: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        createdAt: now, expiresAt: now + SESSION_DURATION_MS, userCount: 1, passwordHash: pwdHash
      };
      if (password) setRoomPassword(password);
      activeMembersRef.current = new Set([FINGERPRINT]);
      enterZone(zone, username, true);
    } catch (e) {
      alert("Location required to initialize a Zone.");
    } finally {
      setTimeout(() => setLoading({ active: false, message: "" }), 500);
    }
  };

  const joinRoom = async (zone: Zone, username: string, password?: string) => {
    setLoading({ active: true, message: "CONNECTING TO SIGNAL", subMessage: "Verifying proximity and credentials..." });
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (zone.type === 'private' && zone.passwordHash) {
      const inputHash = await hashPassword(password || '');
      if (inputHash !== zone.passwordHash) {
        setLoading({ active: false, message: "" });
        return alert("Access Denied.");
      }
      setRoomPassword(password || '');
    }
    enterZone(zone, username, zone.hostId === FINGERPRINT);
    setTimeout(() => setLoading({ active: false, message: "" }), 500);
  };

  const enterZone = (zone: Zone, username: string, isHost: boolean) => {
    const newUser: User = {
      username: username.toUpperCase(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    };
    setState(prev => ({
      ...prev, currentZone: zone, currentUser: newUser, isHost,
      messages: [], timeLeft: zone.expiresAt - Date.now(),
    }));
    setUnreadCount(0);
    setPendingZoneId(null);
    if (mqttClientRef.current) {
       const roomTopic = `locuschat/v2/rooms/${zone.id}`;
       mqttClientRef.current.publish(roomTopic, JSON.stringify({ type: 'presence', sender: FINGERPRINT }));
       mqttClientRef.current.publish(roomTopic, JSON.stringify({ type: 'history_req', sender: FINGERPRINT }));
    }
  };

  const handleExit = async () => {
    setLoading({ active: true, message: "COLLAPSING TUNNEL", subMessage: "Scrubbing transient RAM buffers..." });
    await new Promise(resolve => setTimeout(resolve, 800));
    setState(prev => ({
      ...prev, currentZone: null, currentUser: null, messages: [], isHost: false,
      timeLeft: SESSION_DURATION_MS, typingUsers: {}, distance: null,
    }));
    setRoomPassword('');
    setUnreadCount(0);
    activeMembersRef.current = new Set([FINGERPRINT]);
    setShowExitConfirm(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('zoneId');
    window.history.replaceState({}, '', url.toString());
    setTimeout(() => setLoading({ active: false, message: "" }), 400);
  };

  const handleShare = async () => {
    if (state.currentZone) {
      const shareUrl = `${window.location.origin}${window.location.pathname}?zoneId=${state.currentZone.id}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Locus Chat Invitation', text: `Join "${state.currentZone.name}"`, url: shareUrl });
        } catch (err: any) {
          if (err.name !== 'AbortError') navigator.clipboard.writeText(shareUrl).then(() => alert("Link copied."));
        }
      } else {
        navigator.clipboard.writeText(shareUrl).then(() => alert("Link copied."));
      }
    }
  };

  const sendMessage = async (text: string, type: MediaType = 'text', mediaData?: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!state.currentUser || !state.currentZone || !mqttClientRef.current) return reject();
      const msg: Message = { id: Math.random().toString(36).substr(2, 9), sender: state.currentUser.username, text, timestamp: Date.now(), type, mediaData };
      mqttClientRef.current.publish(`locuschat/v2/rooms/${state.currentZone.id}`, JSON.stringify({ type: 'message', payload: msg }), (err: any) => {
        if (err) reject(err); else { soundService.playSend(); resolve(); }
      });
    });
  };

  const broadcastTyping = () => {
    if (!state.currentUser || !state.currentZone || !mqttClientRef.current || typingTimeoutRef.current) return;
    mqttClientRef.current.publish(`locuschat/v2/rooms/${state.currentZone.id}`, JSON.stringify({ type: 'typing', sender: state.currentUser.username }));
    typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 2000);
  };

  return (
    <div ref={appRef} className="fixed inset-0 w-full flex flex-col bg-[#0a0a0a] text-gray-100 overflow-hidden">
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
        onExitRequest={() => setShowExitConfirm(true)} onShare={handleShare}
      />
      
      <main className="flex-1 relative overflow-hidden flex flex-col bg-[#0a0a0a]">
        {!state.currentZone ? (
          <>
            <JoinScreen 
              onJoin={joinRoom} onCreate={createRoom} rooms={state.availableRooms}
              deepLinkedZoneId={pendingZoneId} isLoading={loading.active}
            />
            {/* Footer only appears in the discovery/join feed */}
            <Footer 
              status={connectionStatus} timeLeft={state.timeLeft}
              totalTime={SESSION_DURATION_MS} distance={state.distance} fingerprint={FINGERPRINT}
            />
          </>
        ) : (
          <ChatRoom 
            messages={state.messages} currentUser={state.currentUser} typingUsers={state.typingUsers}
            onSendMessage={sendMessage} onTyping={broadcastTyping} onRead={() => setUnreadCount(0)}
          />
        )}
      </main>

      {showExitConfirm && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-in fade-in duration-300">
           <div className="max-w-xs w-full glass border border-white/10 rounded-[2.5rem] p-8 text-center flex flex-col items-center">
              <h2 className="text-xl font-bold mb-3 text-white">Leave Zone?</h2>
              <p className="text-gray-400 text-[10px] leading-relaxed mb-8 mono uppercase tracking-widest">Local chat buffer will be cleared.</p>
              <div className="flex flex-col w-full gap-3">
                <button onClick={handleExit} disabled={loading.active} className="w-full py-4 bg-white/10 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] disabled:opacity-50">Exit Now</button>
                <button onClick={() => setShowExitConfirm(false)} disabled={loading.active} className="w-full py-4 bg-white text-black font-black rounded-2xl uppercase tracking-widest text-[10px] disabled:opacity-50">Cancel</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
