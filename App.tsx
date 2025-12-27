
import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { AppState, Zone, User, Message } from './types';
import { RADIUS_KM, SESSION_DURATION_MS, LOCATION_CHECK_INTERVAL_MS, ADJECTIVES, NOUNS, COLORS } from './constants';
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
  });

  const [invitedZone, setInvitedZone] = useState<Zone | null>(null);
  const mqttClientRef = useRef<any>(null);
  const stateRef = useRef(state);
  const appRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Unified Visual Viewport Management
  useEffect(() => {
    const handleViewport = () => {
      if (appRef.current && window.visualViewport) {
        // Set height to exactly the visual viewport height
        // This is crucial for mobile keyboards
        const height = window.visualViewport.height;
        appRef.current.style.height = `${height}px`;
        
        // On iOS, focus on input sometimes offsets the window
        // Force it back to 0,0
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
        }
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

  // Parse URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zParam = params.get('z');
    if (zParam) {
      try {
        const decodedString = atob(zParam);
        const [id, lat, lng, expiry] = decodedString.split('|');
        
        if (id && lat && lng && expiry) {
          const zone: Zone = {
            id: id,
            center: { lat: parseFloat(lat), lng: parseFloat(lng) },
            createdAt: parseInt(expiry) - SESSION_DURATION_MS,
            expiresAt: parseInt(expiry)
          };
          
          if (Date.now() > zone.expiresAt) {
            alert("This shared zone has already expired.");
            window.history.replaceState({}, '', window.location.pathname);
          } else {
            setInvitedZone(zone);
          }
        }
      } catch (e) {
        console.error("Failed to parse shared zone", e);
      }
    }
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
          const msg = JSON.parse(payload.toString());
          setState(prev => {
            if (prev.messages.some(m => m.id === msg.id)) return prev;
            return {
              ...prev,
              messages: [...prev.messages, msg]
            };
          });
        } catch (e) {
          console.error("Failed to parse incoming message", e);
        }
      }
    });

    mqttClientRef.current = client;
    return () => client.end();
  }, [state.currentZone?.id]);

  // Handle Zone Expiration
  useEffect(() => {
    if (!state.currentZone) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, state.currentZone!.expiresAt - now);
      setState(prev => ({ ...prev, timeLeft: remaining }));
      if (remaining <= 0) handleExit();
    }, 1000);

    return () => clearInterval(timer);
  }, [state.currentZone]);

  // Handle Location Monitoring
  useEffect(() => {
    const checkLocation = async () => {
      if (!stateRef.current.currentZone) return;

      try {
        const pos = await getCurrentPosition();
        const dist = calculateDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          stateRef.current.currentZone.center.lat,
          stateRef.current.currentZone.center.lng
        );

        const inRange = dist <= RADIUS_KM;
        setState(prev => ({ ...prev, isInRange: inRange, distance: dist }));

        if (!inRange) handleExit();
      } catch (error) {
        console.error("Location error:", error);
      }
    };

    const interval = setInterval(checkLocation, LOCATION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

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
        distance: dist
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
    mqttClientRef.current.publish(topic, JSON.stringify(msg));
  };

  return (
    <div 
      ref={appRef}
      className="fixed inset-0 w-full flex flex-col bg-[#0a0a0a] text-gray-100 overflow-hidden"
      style={{ touchAction: 'none' }}
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
            onSendMessage={sendMessage}
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
          <p className="text-gray-400 mb-8 leading-relaxed max-w-xs">You have moved beyond the 2km secure radius. This session has been wiped for your security.</p>
          <button 
            onClick={handleExit}
            className="w-full max-w-[240px] px-8 py-4 bg-white text-black font-black rounded-full hover:bg-gray-200 transition active:scale-95 uppercase tracking-widest text-xs"
          >
            Acknowledge Purge
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
