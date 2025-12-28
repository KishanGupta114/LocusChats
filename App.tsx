
import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { AppState, Zone, User, Message, MediaType } from './types';
import { RADIUS_KM, SESSION_DURATION_MS, ADJECTIVES, NOUNS, COLORS, LOCATION_CHECK_INTERVAL_MS } from './constants';
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
  });

  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'offline'>('offline');
  const [invitedZone, setInvitedZone] = useState<Zone | null>(null);
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  
  const mqttClientRef = useRef<any>(null);
  const stateRef = useRef(state);
  const typingTimeoutRef = useRef<any>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const warningShownRef = useRef(false);
  
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    warningShownRef.current = false;
    setShowExpiryWarning(false);
  }, [state.currentZone?.id]);

  useEffect(() => {
    const handleViewport = () => {
      const vv = window.visualViewport;
      if (!vv || !appRef.current) return;
      appRef.current.style.height = `${vv.height}px`;
      appRef.current.style.transform = `translateY(${vv.offsetTop}px)`;
      if (vv.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
    };
    window.visualViewport?.addEventListener('resize', handleViewport);
    window.visualViewport?.addEventListener('scroll', handleViewport);
    handleViewport();
    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewport);
      window.visualViewport?.removeEventListener('scroll', handleViewport);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mqttClientRef.current) {
        if (!mqttClientRef.current.connected) mqttClientRef.current.reconnect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!state.currentZone) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const remaining = state.currentZone!.expiresAt - now;
      if (remaining <= 0) {
        handleExit();
      } else {
        setState(prev => ({ ...prev, timeLeft: remaining }));
        if (remaining <= 300000 && !warningShownRef.current) {
          setShowExpiryWarning(true);
          warningShownRef.current = true;
          soundService.playReceive();
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [state.currentZone]);

  useEffect(() => {
    if (!state.currentZone) return;
    const proximityInterval = setInterval(async () => {
      try {
        const pos = await getCurrentPosition();
        const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, state.currentZone!.center.lat, state.currentZone!.center.lng);
        const inRange = dist <= RADIUS_KM;
        setState(prev => ({ ...prev, distance: dist, isInRange: inRange }));
      } catch (err) {
        console.error("Location re-check failed", err);
      }
    }, LOCATION_CHECK_INTERVAL_MS);
    return () => clearInterval(proximityInterval);
  }, [state.currentZone]);

  useEffect(() => {
    if (!state.currentZone) {
      if (mqttClientRef.current) {
        mqttClientRef.current.end();
        mqttClientRef.current = null;
      }
      setConnectionStatus('offline');
      return;
    }

    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
        clientId: 'locus_' + Math.random().toString(16).substr(2, 8),
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 2000,
        keepalive: 60,
    });

    const topic = `locuschat/v2/zones/${state.currentZone.id}`;

    client.on('connect', () => {
      client.subscribe(topic);
      setConnectionStatus('connected');
    });

    client.on('reconnect', () => setConnectionStatus('reconnecting'));
    client.on('offline', () => setConnectionStatus('offline'));

    client.on('message', (t, payload) => {
      if (t === topic) {
        try {
          const data = JSON.parse(payload.toString());
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
        } catch (e) {
          console.error("MQTT Payload error", e);
        }
      }
    });

    mqttClientRef.current = client;
    return () => { client.end(); };
  }, [state.currentZone?.id]);

  const handleJoin = async () => {
    try {
      const pos = await getCurrentPosition();
      const now = Date.now();
      let zoneToUse: Zone;
      const searchParams = new URLSearchParams(window.location.search);
      const zoneEncoded = searchParams.get('z');
      
      if (zoneEncoded) {
        try {
          const decoded = atob(zoneEncoded);
          const [id, lat, lng, expiresAt] = decoded.split('|');
          zoneToUse = {
            id,
            center: { lat: parseFloat(lat), lng: parseFloat(lng) },
            createdAt: now,
            expiresAt: parseInt(expiresAt)
          };
          const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, zoneToUse.center.lat, zoneToUse.center.lng);
          if (dist > RADIUS_KM) {
            alert(`Too far (${dist.toFixed(1)}km). Radius is ${RADIUS_KM}km.`);
            return;
          }
        } catch (e) {
          console.error("Invalid link");
          return;
        }
      } else {
        zoneToUse = {
          id: Math.random().toString(36).substr(2, 9),
          center: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          createdAt: now,
          expiresAt: now + SESSION_DURATION_MS,
        };
      }

      const newUser: User = {
        username: `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`.toUpperCase(),
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      };

      setState(prev => ({
        ...prev,
        currentZone: zoneToUse,
        currentUser: newUser,
        messages: [{
          id: 'sys-' + now,
          sender: 'System',
          text: `TUNNEL ESTABLISHED (${RADIUS_KM}KM RADIUS).`,
          timestamp: now,
          isSystem: true,
          type: 'text'
        }],
        timeLeft: zoneToUse.expiresAt - now,
        isInRange: true,
        distance: calculateDistance(pos.coords.latitude, pos.coords.longitude, zoneToUse.center.lat, zoneToUse.center.lng),
        typingUsers: {}
      }));
      window.history.replaceState({}, '', window.location.pathname);
    } catch (err) {
      alert("Location required for Locus Chat.");
    }
  };

  const handleExit = () => {
    setState({
      currentZone: null, currentUser: null, messages: [],
      isInRange: true, distance: null, timeLeft: SESSION_DURATION_MS,
      typingUsers: {},
    });
    setShowExpiryWarning(false);
    warningShownRef.current = false;
  };

  const sendMessage = (text: string, type: MediaType = 'text', mediaData?: string) => {
    if (!state.currentUser || !state.currentZone || !mqttClientRef.current) return;
    const msg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      sender: state.currentUser.username,
      text,
      timestamp: Date.now(),
      type,
      mediaData
    };
    const topic = `locuschat/v2/zones/${state.currentZone.id}`;
    mqttClientRef.current.publish(topic, JSON.stringify({ type: 'message', payload: msg }));
    soundService.playSend();
  };

  const broadcastTyping = () => {
    if (!state.currentUser || !state.currentZone || !mqttClientRef.current || typingTimeoutRef.current) return;
    const topic = `locuschat/v2/zones/${state.currentZone.id}`;
    mqttClientRef.current.publish(topic, JSON.stringify({ type: 'typing', sender: state.currentUser.username, timestamp: Date.now() }));
    typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 2000);
  };

  return (
    <div ref={appRef} className="fixed inset-0 w-full flex flex-col bg-[#0a0a0a] text-gray-100 overflow-hidden will-change-transform">
      <Header 
        zone={state.currentZone} 
        timeLeft={state.timeLeft} 
        distance={state.distance}
        status={connectionStatus}
        onExit={handleExit}
      />
      
      <main className="flex-1 relative overflow-hidden flex flex-col min-h-0 bg-[#0a0a0a]">
        {showExpiryWarning && <ExpiryWarning onDismiss={() => setShowExpiryWarning(false)} onRestart={handleExit} />}
        {!state.currentZone ? (
          <JoinScreen onJoin={handleJoin} invitedZone={invitedZone} />
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

      {!state.isInRange && state.currentZone && (
        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-[100] p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold mb-4">Signal Lost</h2>
          <p className="text-gray-400 mb-8 leading-relaxed max-w-xs">Radius breached ({state.distance?.toFixed(1)}km). Secure session purged.</p>
          <button onClick={handleExit} className="w-full max-w-[240px] px-8 py-4 bg-white text-black font-black rounded-full active:scale-95 uppercase tracking-widest text-xs">Purge Now</button>
        </div>
      )}
    </div>
  );
};

export default App;
