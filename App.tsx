
import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { AppState, Zone, User, Message, MediaType, RoomType } from './types';
import { 
  RADIUS_KM, 
  SESSION_DURATION_MS, 
  COLORS, 
  DISCOVERY_TOPIC,
  DISCOVERY_PULSE_INTERVAL_MS
} from './constants';
import { calculateDistance, getCurrentPosition } from './utils/location';
import { soundService } from './services/soundService';
import JoinScreen from './components/JoinScreen';
import ChatRoom from './components/ChatRoom';
import Header from './components/Header';

const FINGERPRINT = Math.random().toString(36).substr(2, 12);

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
  
  const mqttClientRef = useRef<any>(null);
  const stateRef = useRef(state);
  const typingTimeoutRef = useRef<any>(null);
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Handle URL Deep Links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zId = params.get('zoneId');
    if (zId) {
      setPendingZoneId(zId);
    }
  }, []);

  // Session timer logic - Ensuring time remains accurate
  useEffect(() => {
    if (!state.currentZone) return;

    const interval = setInterval(() => {
      setState(prev => {
        if (!prev.currentZone) return prev;
        const remaining = prev.currentZone.expiresAt - Date.now();
        if (remaining <= 0) {
          clearInterval(interval);
          alert("Session expired. This zone has been decommissioned.");
          // Trigger exit next tick to avoid state conflicts
          setTimeout(handleExit, 0);
          return { ...prev, timeLeft: 0 };
        }
        return { ...prev, timeLeft: remaining };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.currentZone?.id]);

  // Main Discovery & Room Connection
  useEffect(() => {
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
      clientId: 'locus_' + FINGERPRINT,
      clean: true,
      connectTimeout: 30000, 
      reconnectPeriod: 2000,
      keepalive: 60,
    });

    client.on('connect', () => {
      setConnectionStatus('connected');
      client.subscribe(DISCOVERY_TOPIC);
      if (stateRef.current.currentZone) {
        const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone.id}`;
        client.subscribe(roomTopic);
        client.publish(roomTopic, JSON.stringify({ type: 'history_req', sender: FINGERPRINT }));
      }
    });

    client.on('reconnect', () => setConnectionStatus('reconnecting'));
    client.on('offline', () => setConnectionStatus('offline'));
    client.on('error', (err: any) => {
      console.error("MQTT Error:", err.message);
      if (err.message && err.message.includes('connack timeout')) {
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

  const handleDiscoveryPulse = async (room: Zone) => {
    try {
      const pos = await getCurrentPosition();
      const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, room.center.lat, room.center.lng);
      if (dist <= RADIUS_KM && room.expiresAt > Date.now()) {
        setState(prev => {
          const others = prev.availableRooms.filter(r => r.id !== room.id);
          return { ...prev, availableRooms: [...others, room] };
        });
      }
    } catch (e) {}
  };

  const handleRoomEvent = (data: any) => {
    const roomTopic = `locuschat/v2/rooms/${stateRef.current.currentZone?.id}`;
    
    switch (data.type) {
      case 'message':
        const msg = data.payload;
        setState(prev => {
          if (prev.messages.some(m => m.id === msg.id)) return prev;
          if (msg.sender !== prev.currentUser?.username) {
            soundService.playReceive();
            setUnreadCount(c => c + 1);
          }
          return { ...prev, messages: [...prev.messages, msg] };
        });
        break;
      case 'typing':
        if (data.sender === stateRef.current.currentUser?.username) return;
        setState(prev => ({ ...prev, typingUsers: { ...prev.typingUsers, [data.sender]: Date.now() } }));
        break;
      case 'history_req':
        if (stateRef.current.messages.length > 0) {
          mqttClientRef.current.publish(roomTopic, JSON.stringify({ 
            type: 'history_res', 
            target: data.sender,
            payload: stateRef.current.messages 
          }));
        }
        break;
      case 'history_res':
        if (data.target === FINGERPRINT) {
          setState(prev => ({ ...prev, messages: data.payload }));
        }
        break;
      case 'room_delete':
        alert("This Zone has been decommissioned.");
        handleExit();
        break;
    }
  };

  // Discovery pulse logic
  useEffect(() => {
    if (!state.currentZone || !mqttClientRef.current) return;
    const pulse = setInterval(() => {
      mqttClientRef.current.publish(DISCOVERY_TOPIC, JSON.stringify(state.currentZone));
    }, DISCOVERY_PULSE_INTERVAL_MS);
    return () => clearInterval(pulse);
  }, [state.currentZone]);

  const hashPassword = async (pwd: string) => {
    const msgUint8 = new TextEncoder().encode(pwd + "locus-salt");
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const createRoom = async (name: string, type: RoomType, username: string, password?: string) => {
    const pos = await getCurrentPosition();
    const now = Date.now();
    const id = Math.random().toString(36).substr(2, 9);
    const pwdHash = (type === 'private' && password) ? await hashPassword(password) : undefined;

    const zone: Zone = {
      id,
      name: name.toUpperCase(),
      type,
      hostId: FINGERPRINT,
      center: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      createdAt: now,
      expiresAt: now + SESSION_DURATION_MS,
      userCount: 1,
      passwordHash: pwdHash
    };

    if (password) setRoomPassword(password);
    enterZone(zone, username, true);
  };

  const joinRoom = async (zone: Zone, username: string, password?: string) => {
    if (zone.type === 'private' && zone.passwordHash) {
      const inputHash = await hashPassword(password || '');
      if (inputHash !== zone.passwordHash) return alert("Access Denied.");
      setRoomPassword(password || '');
    }
    enterZone(zone, username, zone.hostId === FINGERPRINT);
  };

  const enterZone = (zone: Zone, username: string, isHost: boolean) => {
    const newUser: User = {
      username: username.toUpperCase(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    };

    setState(prev => ({
      ...prev,
      currentZone: zone,
      currentUser: newUser,
      isHost,
      messages: [],
      timeLeft: zone.expiresAt - Date.now(),
    }));
    setUnreadCount(0);
    setPendingZoneId(null);
  };

  const handleExit = () => {
    setState(prev => ({
      ...prev,
      currentZone: null, currentUser: null, messages: [], isHost: false,
      timeLeft: SESSION_DURATION_MS, typingUsers: {},
    }));
    setRoomPassword('');
    setUnreadCount(0);
    setShowExitConfirm(false);
    // Remove query params on exit
    const url = new URL(window.location.href);
    url.searchParams.delete('zoneId');
    window.history.replaceState({}, '', url.toString());
  };

  const handleShare = async () => {
    if (state.currentZone) {
      const shareUrl = `${window.location.origin}${window.location.pathname}?zoneId=${state.currentZone.id}`;
      const text = `Join my ephemeral zone "${state.currentZone.name}" on Locus Chat!`;
      
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Locus Chat Invitation',
            text: text,
            url: shareUrl,
          });
        } catch (err: any) {
          // Gracefully handle cancellation and other errors
          if (err.name !== 'AbortError') {
            console.error('Share failed:', err);
            // Fallback to clipboard if share fails for non-cancellation reasons
            navigator.clipboard.writeText(shareUrl);
            alert("Share failed. Zone link copied to clipboard instead.");
          }
        }
      } else {
        navigator.clipboard.writeText(shareUrl).then(() => {
          alert("Zone invite link copied to clipboard.");
        });
      }
    }
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
        else { soundService.playSend(); resolve(); }
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
        status={connectionStatus}
        isHost={state.isHost}
        password={roomPassword}
        unreadCount={unreadCount}
        onExitRequest={() => setShowExitConfirm(true)}
        onShare={handleShare}
      />
      
      <main className="flex-1 relative overflow-hidden flex flex-col bg-[#0a0a0a]">
        {!state.currentZone ? (
          <JoinScreen 
            onJoin={joinRoom} 
            onCreate={createRoom} 
            rooms={state.availableRooms}
            deepLinkedZoneId={pendingZoneId}
          />
        ) : (
          <ChatRoom 
            messages={state.messages} 
            currentUser={state.currentUser} 
            typingUsers={state.typingUsers}
            onSendMessage={sendMessage}
            onTyping={broadcastTyping}
            onRead={() => setUnreadCount(0)}
          />
        )}
      </main>

      {showExitConfirm && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-in fade-in duration-300">
           <div className="max-w-xs w-full glass border border-white/10 rounded-[2.5rem] p-8 text-center flex flex-col items-center">
              <h2 className="text-xl font-bold mb-3 text-white">Leave Zone?</h2>
              <p className="text-gray-400 text-[10px] leading-relaxed mb-8 mono uppercase tracking-widest">Local chat buffer will be cleared.</p>
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
