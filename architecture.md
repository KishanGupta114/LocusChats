
# Locus Chat: v2 Ephemeral Media Architecture

## 1. System Redesign
Locus Chat v2 upgrades the ephemeral experience with rich media while maintaining a zero-footprint backend.

### Core Upgrades
- **Radius Expansion**: Geofencing increased to 10km.
- **Session Duration**: Time-To-Live (TTL) increased to 120 minutes.
- **Media Support**: 
    - **Audio**: Real-time recording via Web Audio API.
    - **Video**: 60-second hardware-enforced capture.
    - **Images**: Volatile gallery view.

## 2. Media Lifecycle (The "Volatile" Model)
1. **Source**: User captures/selects media.
2. **Buffer**: File is converted to an optimized Base64 string (client-side).
3. **Transport**: Transmitted via WSS/MQTT as a "Single-Use Payload".
4. **Consumption**: Peer renders data from RAM.
5. **Purge**: 
    - Manual: `revokedObjectURL` and RAM clearing on message removal.
    - Automatic: App unmount, radius breach, or session timeout clears all local states.

## 3. Advanced Security
- **Memory-Only State**: All media exists in the application's JavaScript heap; no local storage or cookies are used.
- **Broker-Level Ephemerality**: Using a "Clean Session" MQTT configuration prevents message storage on the broker.
- **Location Shielding**: Lat/Lng are never sent to the broker; only the Zone ID (a random hash) is used for topic subscription.

## 4. Technical Specs
- **Video Max**: 60 seconds (H.264/WebM).
- **Audio Max**: 60 seconds (Opus/WebM).
- **Image Max**: 1MB (optimized via canvas before send).
- **Transport Layer**: EMQX Broker (WebSocket Secure).
