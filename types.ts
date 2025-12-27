
export interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface User {
  username: string;
  color: string;
}

export interface Zone {
  id: string;
  center: {
    lat: number;
    lng: number;
  };
  createdAt: number;
  expiresAt: number;
}

export interface AppState {
  currentZone: Zone | null;
  currentUser: User | null;
  messages: Message[];
  isInRange: boolean;
  distance: number | null;
  timeLeft: number;
}
