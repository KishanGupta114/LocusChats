
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

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Periodic session time update
  useEffect(() => {
    if (!state.currentZone) return;
    const interval = setInterval(() => {
      const remaining = stateRef.current.currentZone!.expiresAt - Date.now();
      if (remaining <= 0) {
        handleExit();
      } else {
        setState(prev => ({ ...prev, timeLeft: remaining }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state.currentZone?.id]);

  // Reliable Location Tracking
  useEffect(() => {
    const updateLocation = async () => {
      try {
        const pos = await getCurrentPosition();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng });

        // Request rooms if location just arrived and we are connected
        if (!userLocation && mqttClientRef.current?.connected) {
          mqttClientRef.current.publish(DISCOVERY_REQ_TOPIC, JSON.stringify({ type: 'sync_req', sender: FINGERPRINT }));
        }

        if (stateRef.current.currentZone) {
          const d = calculateDistance(lat, lng, stateRef.current.currentZone.center.lat, stateRef.current.currentZone.center.lng);
          setState(prev => ({ ...prev, distance: d }));
        }
      } catch (e) {
        console.warn("Location check failed", e);
      }
    };

    updateLocation();
    const locInterval = setInterval(updateLocation, LOCATION_CHECK_INTERVAL_MS);
    return () => clearInterval(locInterval);
  }, []);

  // Handle room discovery logic
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

      const updatedRooms = inRange ? [...others, room].sort((a,b) => b.createdAt - a.createdAt) : others;
      
      // If this pulse is for our own room, update local count
      const updatedCurrentZone = isCurrentZone 
        ? { ...prev.currentZone, userCount: Math.max(prev.currentZone?.userCount || 1, room.userCount) } 
        : prev.currentZone;

      return { 
        ...prev, 
        availableRooms: updatedRooms, 
        currentZone: updatedCurrentZone as Zone | null 
      };
    });
  };

  const handleRoomEvent = (data: any) => {
    if (!stateRef.current.currentZone) return;
    const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone.id}`;
    
    switch (data.type) {
      case 'message':
        const msg = data.payload;
        if (stateRef.current.isHost && msg.sender) activeMembersRef.current.add(msg.sender);
        
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
      case 'presence':
        if (stateRef.current.isHost) {
          activeMembersRef.current.add(data.sender);
        }
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
      client.subscribe(DISCOVERY_REQ_TOPIC);
      
      // Request initial list
      client.publish(DISCOVERY_REQ_TOPIC, JSON.stringify({ type: 'sync_req', sender: FINGERPRINT }));

      if (stateRef.current.currentZone) {
        const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone.id}`;
        client.subscribe(roomTopic);
        client.publish(roomTopic, JSON.stringify({ type: 'history_req', sender: FINGERPRINT }));
        client.publish(roomTopic, JSON.stringify({ type: 'presence', sender: FINGERPRINT }));
      }
    });

    client.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString());
        if (topic === DISCOVERY_TOPIC) {
          handleDiscoveryPulse(data);
        } else if (topic === DISCOVERY_REQ_TOPIC) {
          if (stateRef.current.isHost && data.sender !== FINGERPRINT) {
            broadcastHostZone();
          }
        } else if (stateRef.current.currentZone && topic === `locuschat/v2/rooms/${stateRef.current.currentZone.id}`) {
          handleRoomEvent(data);
        }
      } catch (e) { console.error("MQTT data error", e); }
    });

    mqttClientRef.current = client;
    return () => client && client.end(true);
  }, [state.currentZone?.id, state.isHost]);

  const broadcastHostZone = () => {
    if (!stateRef.current.isHost || !stateRef.current.currentZone || !mqttClientRef.current?.connected) return;
    
    const currentCount = Math.max(1, activeMembersRef.current.size);
    const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone.id}`;
    
    mqttClientRef.current.publish(DISCOVERY_TOPIC, JSON.stringify({ 
      ...stateRef.current.currentZone, 
      userCount: currentCount 
    }));
    
    mqttClientRef.current.publish(roomTopic, JSON.stringify({ 
      type: 'count_sync', 
      count: currentCount 
    }));

    // Reset member detection window
    activeMembersRef.current = new Set([FINGERPRINT]);
  };

  // Host: Periodic Discovery Refresh & Member Sync
  useEffect(() => {
    if (!state.isHost || !state.currentZone) return;
    const interval = setInterval(broadcastHostZone, DISCOVERY_PULSE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [state.isHost, state.currentZone?.id]);

  // Client: Periodic Presence Pulse
  useEffect(() => {
    if (!state.currentZone || !mqttClientRef.current) return;
    const interval = setInterval(() => {
      if (mqttClientRef.current.connected) {
        const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone?.id}`;
        mqttClientRef.current.publish(roomTopic, JSON.stringify({ type: 'presence', sender: FINGERPRINT }));
      }
    }, 10000); // 10s heartbeat
    return () => clearInterval(interval);
  }, [state.currentZone?.id]);

  const hashPassword = async (pwd: string) => {
    const msgUint8 = new TextEncoder().encode(pwd + "locus-salt");
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleBrandClick = () => {
    if (state.currentZone) setShowExitConfirm(true);
    else {
      setLoading({ active: true, message: "REFRESHING SIGNALS", subMessage: "Scanning local broadcast spectrum..." });
      if (mqttClientRef.current?.connected) {
        mqttClientRef.current.publish(DISCOVERY_REQ_TOPIC, JSON.stringify({ type: 'sync_req', sender: FINGERPRINT }));
      }
      setTimeout(() => setLoading({ active: false, message: "" }), 800);
    }
  };

  const handleShare = async () => {
    if (state.currentZone) {
      const shareUrl = `${window.location.origin}${window.location.pathname}?zoneId=${state.currentZone.id}&n=${encodeURIComponent(state.currentZone.name)}&t=${state.currentZone.type}`;
      if (navigator.share) {
        try {
          await navigator.share({ 
            title: 'Locus Chat Invitation', 
            text: `Join the ephemeral zone: "${state.currentZone.name}"`, 
            url: shareUrl 
          });
        } catch (err: any) {
          if (err.name !== 'AbortError') copyToClipboard(shareUrl);
        }
      } else {
        copyToClipboard(shareUrl);
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("Discovery link copied to clipboard.");
    }).catch(() => {
      alert("Failed to copy link. Please copy URL manually.");
    });
  };

  const createRoom = async (name: string, type: RoomType, username: string, password?: string) => {
    setLoading({ active: true, message: "INITIALIZING SENSORS", subMessage: "Locking geolocation coordinates..." });
    try {
      const pos = await getCurrentPosition();
      setLoading({ active: true, message: "GENERATING SECURE TUNNEL", subMessage: "Creating transient frequency..." });
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
      }, 1200);
    } catch (e) {
      alert("Location access is mandatory for discovery.");
      setLoading({ active: false, message: "" });
    }
  };

  const joinRoom = async (zone: Zone, username: string, password?: string) => {
    setLoading({ active: true, message: "CONNECTING TO SIGNAL", subMessage: "Verifying ephemeral signature..." });
    if (zone.type === 'private' && zone.passwordHash) {
      if (await hashPassword(password || '') !== zone.passwordHash) {
        setLoading({ active: false, message: "" });
        return alert("Access Denied: Invalid Key.");
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
      mqttClientRef.current.publish(roomTopic, JSON.stringify({ type: 'presence', sender: FINGERPRINT }));
    }
  };

  const handleExit = async () => {
    const finalize = () => {
      setLoading({ active: true, message: "COLLAPSING TUNNEL", subMessage: "Purging RAM buffer cache..." });
      setState(prev => ({ ...prev, currentZone: null, currentUser: null, messages: [], isHost: false, timeLeft: SESSION_DURATION_MS }));
      setRoomPassword('');
      setShowExitConfirm(false);
      const url = new URL(window.location.href);
      url.searchParams.delete('zoneId');
      window.history.replaceState({}, '', url.toString());
      setTimeout(() => setLoading({ active: false, message: "" }), 800);
    };

    if (mqttClientRef.current?.connected && state.currentZone && state.currentUser) {
      const roomTopic = `locuschat/v2/rooms/${state.currentZone.id}`;
      mqttClientRef.current.publish(roomTopic, JSON.stringify({ 
        type: 'message', 
        payload: { id: `sys_leave_${Date.now()}`, sender: state.currentUser.username, timestamp: Date.now(), isSystem: true, systemType: 'leave', type: 'system' } 
      }), () => {
        finalize();
      });
      setTimeout(finalize, 800); // Safety timeout
    } else {
      finalize();
    }
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
        onExitRequest={() => setShowExitConfirm(true)} onShare={handleShare} 
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
           <div className="max-w-xs w-full glass border border-white/10 rounded-[2.5rem] p-8 text-center flex flex-col items-center shadow-2xl">
              <h2 className="text-xl font-bold mb-3 text-white">Leave Zone?</h2>
              <p className="text-gray-400 text-[10px] leading-relaxed mb-8 mono uppercase tracking-widest text-center">Your local chat session data will be permanently purged.</p>
              <div className="flex flex-col w-full gap-3">
                <button onClick={handleExit} className="w-full py-4 bg-white/10 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] active:scale-95 transition-transform">Exit Now</button>
                <button onClick={() => setShowExitConfirm(false)} className="w-full py-4 bg-white text-black font-black rounded-2xl uppercase tracking-widest text-[10px] active:scale-95 transition-transform">Cancel</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
