
import React, { useState, useEffect, useRef } from 'react';
import { AppState, Zone, User, Message } from './types';
import { RADIUS_KM, SESSION_DURATION_MS, LOCATION_CHECK_INTERVAL_MS, ADJECTIVES, NOUNS, COLORS } from './constants';
import { calculateDistance, getCurrentPosition } from './utils/location';
import JoinScreen from './components/JoinScreen';
import ChatRoom from './components/ChatRoom';
import Header from './components/Header';

// We use BroadcastChannel to simulate a multi-tab local "server" experience for this demo environment
const bc = new BroadcastChannel('locus_chat_sync');

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
  const stateRef = useRef(state);
  
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Parse URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zParam = params.get('z');
    if (zParam) {
      try {
        const decoded = JSON.parse(atob(zParam));
        const zone: Zone = {
          id: decoded.i,
          center: { lat: decoded.la, lng: decoded.lo },
          createdAt: decoded.e - SESSION_DURATION_MS,
          expiresAt: decoded.e
        };
        
        // Check if expired
        if (Date.now() > zone.expiresAt) {
          alert("This shared zone has already expired.");
          window.history.replaceState({}, '', window.location.pathname);
        } else {
          setInvitedZone(zone);
        }
      } catch (e) {
        console.error("Failed to parse shared zone", e);
      }
    }
  }, []);

  // Handle Zone Expiration
  useEffect(() => {
    if (!state.currentZone) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, state.currentZone!.expiresAt - now);
      
      setState(prev => ({ ...prev, timeLeft: remaining }));

      if (remaining <= 0) {
        handleExit();
      }
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

        if (!inRange) {
          handleExit();
        }
      } catch (error) {
        console.error("Location error:", error);
      }
    };

    const interval = setInterval(checkLocation, LOCATION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Sync messages across tabs (simulating a backend)
  useEffect(() => {
    const handleSync = (event: MessageEvent) => {
      const { type, payload } = event.data;
      if (type === 'NEW_MESSAGE') {
        // Only accept messages for our specific zone
        if (stateRef.current.currentZone && payload.zoneId === stateRef.current.currentZone.id) {
            setState(prev => ({
              ...prev,
              messages: [...prev.messages, payload]
            }));
        }
      }
    };

    bc.addEventListener('message', handleSync);
    return () => bc.removeEventListener('message', handleSync);
  }, []);

  const handleJoin = async () => {
    try {
      const pos = await getCurrentPosition();
      const now = Date.now();
      
      let zoneToUse: Zone;

      if (invitedZone) {
        // Verify distance for invited zone
        const dist = calculateDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          invitedZone.center.lat,
          invitedZone.center.lng
        );

        if (dist > RADIUS_KM) {
          alert(`You are outside the 2km range of this zone (${dist.toFixed(2)}km away). You cannot join.`);
          return;
        }
        zoneToUse = invitedZone;
      } else {
        // Create new zone
        zoneToUse = {
          id: Math.random().toString(36).substr(2, 9),
          center: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          createdAt: now,
          expiresAt: now + SESSION_DURATION_MS,
        };
      }

      const newUser: User = {
        username: `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`,
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
          text: `Welcome, ${newUser.username}. You are within the 2km zone limit.`,
          timestamp: now,
          isSystem: true
        }],
        timeLeft: zoneToUse.expiresAt - now,
        isInRange: true,
        distance: dist
      }));

      // Clear the invite state
      setInvitedZone(null);
      // Clean URL
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
    if (!state.currentUser || !state.currentZone) return;
    const msg: Message & { zoneId: string } = {
      id: Math.random().toString(36).substr(2, 9),
      sender: state.currentUser.username,
      text,
      timestamp: Date.now(),
      zoneId: state.currentZone.id
    };
    setState(prev => ({ ...prev, messages: [...prev.messages, msg] }));
    bc.postMessage({ type: 'NEW_MESSAGE', payload: msg });
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0a0a] text-gray-100 overflow-hidden relative">
      <Header 
        zone={state.currentZone} 
        timeLeft={state.timeLeft} 
        distance={state.distance}
        onExit={handleExit}
      />
      
      <main className="flex-1 relative">
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
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50 p-6 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Outside Range</h2>
          <p className="text-gray-400 mb-6">You have moved beyond the 2km limit. Your session has been terminated and data purged.</p>
          <button 
            onClick={handleExit}
            className="px-6 py-2 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition"
          >
            Acknowledge
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
