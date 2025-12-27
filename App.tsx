
import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { AppState, Zone, User, Message } from './types';
import { RADIUS_KM, SESSION_DURATION_MS, ADJECTIVES, NOUNS, COLORS } from './constants';
import { calculateDistance, getCurrentPosition } from './utils/location';
import JoinScreen from './components/JoinScreen';
import ChatRoom from './components/ChatRoom';
import Header from './components/Header';

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

  const [invitedZone, setInvitedZone] = useState<Zone | null>(null);
  const mqttClientRef = useRef<any>(null);
  const stateRef = useRef(state);
  const typingTimeoutRef = useRef<any>(null);
  const appRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Unified Visual Viewport Management for Mobile Keyboards
  useEffect(() => {
    const handleViewport = () => {
      const vv = window.visualViewport;
      if (!vv || !appRef.current) return;
      
      // We set the height to exactly the visible area height
      appRef.current.style.height = `${vv.height}px`;
      
      // On some mobile browsers, the keyboard "shifts" the whole window. 
      // We counteract that shift by translating the app container to stay at the visible top.
      appRef.current.style.transform = `translateY(${vv.offsetTop}px)`;

      // Force scroll reset on the window to prevent "phantom" scroll space
      if (vv.offsetTop > 0 || window.scrollY > 0) {
        window.scrollTo(0, 0);
      }
    };

    window.visualViewport?.addEventListener('resize', handleViewport);
    window.visualViewport?.addEventListener('scroll', handleViewport);
    
    // Initial call
    handleViewport();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewport);
      window.visualViewport?.removeEventListener('scroll', handleViewport);
    };
  }, []);

  // Cleanup stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const anyStale = Object.values(stateRef.current.typingUsers).some(t => now - (t as number) > 3500);
      
      if (anyStale) {
        setState(prev => {
          const newTyping = { ...prev.typingUsers };
          let changed = false;
          for (const [user, time] of Object.entries(newTyping)) {
            if (now - (time as number) > 3500) {
              delete newTyping[user];
              changed = true;
            }
          }
          return changed ? { ...prev, typingUsers: newTyping } : prev;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // MQTT Connection Management
  useEffect(() => {
    if (!state.currentZone) {
      if (mqttClientRef.current) {
        mqttClientRef.current.end();
        mqttClientRef.current = null;
      }
      return;
    }

    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
        clientId: 'locus_' + Math.random().toString(16).substr(2, 8),
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 1000,
    });

    const topic = `locuschat/v1/zones/${state.currentZone.id}`;

    client.on('connect', () => {
      client.subscribe(topic);
    });

    client.on('message', (t, payload) => {
      if (t === topic) {
        try {
          const data = JSON.parse(payload.toString());
          
          if (data.type === 'typing') {
            if (data.sender === stateRef.current.currentUser?.username) return;
            setState(prev => ({
              ...prev,
              typingUsers: {
                ...prev.typingUsers,
                [data.sender]: Date.now()
              }
            }));
          } else {
            const msg = data.type === 'message' ? data.payload : data;
            setState(prev => {
              if (prev.messages.some(m => m.id === msg.id)) return prev;
              const newTyping = { ...prev.typingUsers };
              delete newTyping[msg.sender];
              return {
                ...prev,
                messages: [...prev.messages, msg],
                typingUsers: newTyping
              };
            });
          }
        } catch (e) {
          console.error("Failed to parse incoming payload", e);
        }
      }
    });

    mqttClientRef.current = client;
    return () => client.end();
  }, [state.currentZone?.id]);

  const handleJoin = async () => {
    try {
      const pos = await getCurrentPosition();
      const now = Date.now();
      
      let zoneToUse: Zone;

      if (invitedZone) {
        const dist = calculateDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          invitedZone.center.lat,
          invitedZone.center.lng
        );

        if (dist > RADIUS_KM) {
          alert(`You are outside the 2km range (${dist.toFixed(2)}km away).`);
          return;
        }
        zoneToUse = invitedZone;
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

      const dist = calculateDistance(
        pos.coords.latitude,
        pos.coords.longitude,
        zoneToUse.center.lat,
        zoneToUse.center.lng
      );

      setState(prev => ({
        ...prev,
        currentZone: zoneToUse,
        currentUser: newUser,
        messages: [{
          id: 'sys-' + now,
          sender: 'System',
          text: `ENCRYPTED CONNECTION ESTABLISHED IN ZONE ${zoneToUse.id.toUpperCase()}.`,
          timestamp: now,
          isSystem: true
        }],
        timeLeft: zoneToUse.expiresAt - now,
        isInRange: true,
        distance: dist,
        typingUsers: {}
      }));

      setInvitedZone(null);
      window.history.replaceState({}, '', window.location.pathname);

    } catch (err) {
      alert("Please allow location access to join Locus Chat.");
    }
  };

  const handleExit = () => {
    setState({
      currentZone: null,
      currentUser: null,
      messages: [],
      isInRange: true,
      distance: null,
      timeLeft: 0,
      typingUsers: {},
    });
    setInvitedZone(null);
  };

  const sendMessage = (text: string) => {
    if (!state.currentUser || !state.currentZone || !mqttClientRef.current) return;
    
    const msg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      sender: state.currentUser.username,
      text,
      timestamp: Date.now()
    };

    const topic = `locuschat/v1/zones/${state.currentZone.id}`;
    mqttClientRef.current.publish(topic, JSON.stringify({ type: 'message', payload: msg }));
  };

  const broadcastTyping = () => {
    if (!state.currentUser || !state.currentZone || !mqttClientRef.current) return;
    if (typingTimeoutRef.current) return;
    
    const topic = `locuschat/v1/zones/${state.currentZone.id}`;
    mqttClientRef.current.publish(topic, JSON.stringify({ 
      type: 'typing', 
      sender: state.currentUser.username,
      timestamp: Date.now()
    }));

    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2000);
  };

  return (
    <div 
      ref={appRef}
      className="fixed inset-0 w-full flex flex-col bg-[#0a0a0a] text-gray-100 overflow-hidden will-change-transform"
    >
      <Header 
        zone={state.currentZone} 
        timeLeft={state.timeLeft} 
        distance={state.distance}
        onExit={handleExit}
      />
      
      <main className="flex-1 relative overflow-hidden flex flex-col min-h-0 bg-[#0a0a0a]">
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
          <p className="text-gray-400 mb-8 leading-relaxed max-w-xs">You have moved beyond the 2km secure radius. This session has been wiped.</p>
          <button 
            onClick={handleExit}
            className="w-full max-w-[240px] px-8 py-4 bg-white text-black font-black rounded-full hover:bg-gray-200 transition active:scale-95 uppercase tracking-widest text-xs"
          >
            Purge Session
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
