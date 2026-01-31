# Entropy Orchestration 🏎️

A **48-hour Game Jam** demolition derby racing game with a synthwave aesthetic.

![Splash](./renderer/public/splash.png)

## 🎮 Concept

Players use their **phones as controllers** to drive neon cars on a shared big screen. Last car standing wins!

**Theme:** "MASK" - Players wear digital masks that hide their identity until elimination.

## 📋 Features

- 🚗 **12 Unique Tracks** with themes (Stadium, Industrial, Volcanic, etc.)
- 🎵 **Dynamic Music** with 12 track-specific styles (90-160 BPM)
- 🔫 **Weapons System** - Missiles and Lasers
- 🤖 **AI Opponents** - CPU cars when <3 players
- 🎭 **5 Mask Types** - Classic, Oni, Tech, Clown, Skull
- 🏆 **Leaderboard** - Wins, kills, deaths tracking
- 📺 **Demo Mode** - Auto-starts after 60s with no players

## 🏗️ Architecture

```
Entropy-Orchestration/
├── server/          # Node.js + Socket.io + cannon-es physics
├── renderer/        # React Three Fiber (R3F) + Drei visuals
└── controller/      # Mobile-optimized React UI
```

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start all services
npm run dev:server      # Server on :3000
npm run dev:renderer    # Renderer on :5173
npm run dev:controller  # Controller on :5174
```

## 📱 How to Play

1. Open the **renderer** on a big screen/TV
2. Scan the QR code with your phone
3. Enter your name and choose a mask
4. Use phone tilt to steer, touch to accelerate/brake
5. Pick up powerups, fire weapons, survive!

## 🧪 Testing

```bash
cd server
npm test
```

26 tests covering: Physics, Boundaries, Leaderboard, Demo Mode, Tracks, Weapons, Damage, Masks, Audio.

## 🎨 Tech Stack

| Component | Technology |
|-----------|------------|
| Server | Node.js, Socket.io, cannon-es |
| Renderer | React, Three.js, R3F, Drei |
| Controller | React, DeviceOrientation API |
| Audio | Web Audio API (procedural synth) |
| Testing | Jest |

## 📡 Socket Events

### Server → Client
- `worldState` - Game world state (players, powerups, traps)
- `gameState` - Game phase (LOBBY, COUNTDOWN, RACING, WINNER)
- `trackData` - Current track info
- `leaderboard` - Top 10 players
- `projectileFired` - Weapon projectile spawned

### Client → Server
- `join` - Join with name and mask type
- `input` - Steering, throttle, boost
- `fire` - Fire weapon

## 🎭 Mask Theme

The "mask" game jam theme is interpreted as digital identity:
- Players are "MASKED RACER #N" until death reveals true name
- 5 visual mask styles for car customization
- Future: Mask powerup to steal another player's appearance

## 📜 License

MIT - Made with 💜 for Game Jam 2026
