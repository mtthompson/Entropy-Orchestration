# AGENTS.md - Project Entropy Orchestration

## Project Overview
This is a 48-hour Game Jam project with the theme: **"MASK"**
**Concept:** A "Demolition Derby Racer" (Combat Racing).
**Goal:** Players use phones to drive. The game runs on a shared big screen. Survival is key.
**Mask Theme:** Players wear digital "masks" (identities) that hide their true selves until elimination reveals their stats.
**Domain:** `jam.gimongous.net` (Renderer displays QR code pointing here).

## System Architecture
* **Server:** Unraid Docker (Node.js) - Headless Authority.
* **Renderer:** Laptop (RTX 4070) - High-end Visuals.
* **Controllers:** Mobile Phones - Input & Dashboard.

---

## 1. The Server (Authority)
* **Tech:** Node.js, Socket.io, `cannon-es`, Jest.
* **Physics:**
    * Bodies: Spheres for cars (prevents flipping). Mass: 50.
    * Collisions: Enabled with damage calculation.
    * Boundary enforcement: Auto-respawn if out of bounds.
* **Power-ups:** Repair, Boost, Shield, Ghost, Juggernaut, Weapon.
* **CPU Opponents:** 1-3 AI cars spawn if <3 human players.
* **Weapons System:** Missiles (40 dmg) and Lasers (20 dmg) with projectile physics.
* **Demo Mode:** Auto-starts after 60s with no players (4-6 CPU battle).
* **Leaderboard:** Tracks wins/kills/deaths, persisted in memory.

---

## 2. The Renderer (Visuals)
* **Tech:** React Three Fiber (R3F), Drei, Post-Processing.
* **Aesthetic:** Vaporwave / Synthwave with 12 unique track themes.
* **Features:**
    * Trail effects behind cars
    * Particle explosions on elimination
    * Enhanced powerup visuals (beacons, glow, rings)
    * Projectile rendering (missiles/lasers)
    * LeaderboardDisplay in lobby
    * DemoModeIndicator banner
* **Camera:** Pack-leader following with smooth interpolation.

---

## 3. The Controller (Mobile Input)
* **UI:**
    * Lobby: Name entry + Mask selection.
    * Dashboard: Health bar, Boost meter, Ammo display, Fire button.
* **Input:** DeviceOrientation (steering) + Touch (throttle/boost/fire).
* **Haptic:** Vibration on impact, damage, powerups.

---

## 4. Audio System
* **Music:** 12 track-specific styles (90-160 BPM, various keys).
* **SFX:** Engine noise, crashes, powerup pickups, weapons.
* **Dynamic:** Intensity varies with game action.

---

## 5. Track Themes (12 Unique)

| Track | Theme | Colors | Scenery |
|-------|-------|--------|---------|
| Stadium Oval | Classic Synthwave | Magenta/Cyan | Spotlights |
| Thunder Dome | Industrial | Orange/Yellow | Metal beams |
| The Switchback | Neon Forest | Mint/Cyan | Glowing trees |
| Cloverleaf | Nature | Lime/White | Plants |
| Hexagon Heat | Volcanic | Hot pink/Orange | Lava/smoke |
| Dragon's Tail | Oriental | Red/Gold | Lanterns |
| The Octagon | Mystic | Purple/Magenta | Crystals |
| Grand Prix | Classic | White/Red | Checkered flags |
| Triangle Terror | Warning | Yellow/Red | Hazard signs |
| Velocity Strip | Speed | Electric blue/Cyan | Motion blur |
| The Coliseum | Roman | Gold/Bronze | Pillars/torches |
| The Cage | Prison | Gray/Red | Chain link |

---

## 6. Mask Theme Integration
The "mask" theme is interpreted as digital identity:

* **Anonymous Racing:** Player names hidden until death (shown as "MASKED RACER #1").
* **UNMASKED Reveal:** True identity shown in dramatic elimination banner.
* **Visual Mask:** Cars have emoji mask icons with HP-based glow.
* **Mask Types:** Players choose from 5 masks, each with unique ability:

| Mask | Icon | Ability |
|------|------|---------|
| Classic | 🎭 | Balanced (no bonus) |
| Oni | 👹 | +15% damage resistance |
| Tech | 🤖 | +50% boost regeneration |
| Clown | 🤡 | Random speed bursts |
| Skull | 💀 | +10% max speed |

---

## Development Status (Updated: 2026-01-31)

### ✅ Fully Implemented
* Project scaffold with npm workspaces
* Server with 60Hz physics, collision damage, boundary enforcement
* 12 race tracks with unique themes
* CPU opponents with AI steering
* Weapons system (missiles/lasers)
* Demo mode (60s auto-trigger)
* Leaderboard system (wins/kills/deaths)
* Enhanced powerup visuals
* Projectile rendering
* Jest testing framework

### 🚧 In Progress
* Particle effects (speed lines, impacts)
* Dynamic audio mixing
* Creative mask theme visuals
* Camera enhancements

---

## Dev Commands
```bash
npm run dev:server      # Server on :3000
npm run dev:renderer    # Renderer on :5173
npm run dev:controller  # Controller on :5174

# Testing
cd server && npm test   # Run Jest tests

# Tailscale:
tailscale serve --bg http://localhost:5174
tailscale serve --bg --set-path /api http://localhost:3000
```

---

## Socket Events

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `worldState` | `{players, powerups, traps}` | Game world state |
| `gameState` | `{state, timer, winner, isDemo}` | Game phase |
| `trackData` | Track object | Current track info |
| `trackStyle` | `{trackId, trackName}` | Music style trigger |
| `leaderboard` | Array of entries | Top 10 leaderboard |
| `demoMode` | `{active}` | Demo mode status |
| `projectileFired` | `{position, direction, type}` | Projectile spawn |
| `damage` | `{hp, damage}` | Damage taken |

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join` | `{name, maskType}` | Join game |
| `input` | `{steering, throttle, boost}` | Player controls |
| `fire` | (none) | Fire weapon |
| `spawnTrap` | `{x, z}` | Spectator trap drop |