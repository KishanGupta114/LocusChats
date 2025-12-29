
export type MediaType = 'text' | 'image' | 'video' | 'audio';
export type RoomType = 'public' | 'private';

export interface Message {
  id: string;
  sender: string;
  text?: string;
  timestamp: number;
  isSystem?: boolean;
  type: MediaType;
  mediaData?: string; 
}

export interface User {
  username: string;
  color: string;
}

export interface Zone {
  id: string;
  name: string;
  type: RoomType;
  hostId: string; // Fingerprint of the creator
  passwordHash?: string;
  center: {
    lat: number;
    lng: number;
  };
  createdAt: number;
  expiresAt: number;
  userCount: number;
}

export interface AppState {
  currentZone: Zone | null;
  currentUser: User | null;
  isHost: boolean;
  messages: Message[];
  isInRange: boolean;
  distance: number | null;
  timeLeft: number;
  typingUsers: Record<string, number>;
  availableRooms: Zone[];
  userFingerprint: string; // Random ID generated per browser session
}
