
# Locus Chat: Architecture & Privacy Design

## 1. System Overview
Locus Chat is an **ephemeral proximity-based communication layer**. It avoids traditional server-side state persistence in favor of memory-only volatility.

### Components
- **Client (React/TS)**: Handles UI, GPS logic, and local data destruction.
- **Transport (Current)**: `BroadcastChannel` for same-device multi-tab testing.
- **Transport (Production Scale)**: Ephemeral WebSocket Relay (e.g., Ably/Pusher) or WebRTC P2P.
- **Privacy Engine**: 
    - Geofencing: Constant <2km validation.
    - Identity: Random user generation (Adjective + Noun).
    - TTL (Time-To-Live): 60-minute hard expiry.

## 2. Data Flow
1. **Entrance**: User -> Permission -> GPS Fetch -> Zone Discovery/Creation.
2. **Sharing**: Zone metadata (ID, Center, Expiry) is encoded into a Base64 URL parameter.
3. **Session**: Message -> Transport -> Broadcast to peers in Zone.
4. **Purge Events**:
    - **Distance Exit**: `dist > 2km` -> Trigger `Session.Wipe()`.
    - **Time Expire**: `now > expiresAt` -> Trigger `Session.Wipe()`.
    - **Client Close**: Unmount -> Volatile memory clear.

## 3. Privacy Risk Analysis
| Risk | Mitigation |
|------|------------|
| **Location Tracking** | Coordinates are used only for distance calculation (client-side) and never sent to a persistent DB. |
| **Abuse/Spam** | AI-driven lightweight moderation (Gemini) checks content without profiling the user. |
| **Message Recovery** | Messages exist only in RAM. No database persistence exists at any layer. |

## 4. Deployment Instructions
1. **GitHub**: Push code to a private or public repository.
2. **Vercel/Netlify**: Connect repository for automated HTTPS deployment (Required for Geolocation).
3. **API Key**: Configure `API_KEY` in the hosting provider's Environment Variables.
4. **HTTPS**: Ensure the site is accessed via `https://` or location permissions will be denied by the browser.
