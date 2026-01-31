# Project Tasks: Entropy Orchestration (Demolition Derby Racer)

## ✅ Completed / Stability
### Critical Bugs
- [x] **Fix "Join Race" Button on Mobile**
- [x] **Fix Track Wall Visuals** (Thin, Glowing)
- [x] **Fix Flashing Floor / Z-Fighting**
- [x] **Fix Physics Holes in Track** (Thick barriers)
- [x] **Eliminate Input Lag** (30Hz optimized)

### Gameplay & Physics
- [x] **Sharpen Steering Response** (Exponential curve)
- [x] **Realistic Sphere Movement** (Mass 50, Damping 0.5)
- [x] **Combat Logic** (Collisions & Elimination)
- [x] **Power-ups System (Basic)** (Repair, Boost spawning)
- [x] **Spectator / Drone Mode** (Drone UI, Dropping Traps)
- [x] **Visual Effects** (Trails, Damage Flicker, Explosions)

---

## 🚧 Phase 2: Game Jam Expansion

### 🎨 Core Assets & Theme
- [ ] **Assets:** Source/Generate 3-4 "Mask" Car Models (Oni, Tech, Clown)
- [ ] **Assets:** Animation Sprites (Explosion, Smoke, Boost, N64 style)
- [x] **Assets:** Scenery Elements (Neon Palms, Mountains, Sun, Buildings)
- [x] **Audio:** N64-style Background Music (Loopable) & SFX
- [ ] **Theme Integration ("Mask")**
    - [ ] **Controller:** Add Mask Selector to Lobby
    - [ ] **Controller:** Add Haptic Feedback (Vibration)
    - [ ] **Server:** Handle `maskType` in player join/state
    - [ ] **Renderer:** Render specific models per player

### ⚔️ Advanced Mechanics (PvP)
- [x] **Directional Ramming**
    - [x] Frontend hits deal 1.2x damage, self takes 0.7x
    - [x] Apply knockback impulse based on velocity
- [x] **New Power-ups**
    - [x] **Shield:** 5s Invulnerability (Blue Bubble)
    - [x] **Phase Shift/Ghost:** 5s Pass-through (Mask Theme)
    - [x] **Juggernaut:** 10s Double Mass + Red Glow
    - [x] **Weapon:** Missiles (40dmg) and Lasers (20dmg)
    - [x] **67Meme:** Easter egg +67 HP repair
- [x] **Spawning:** Items spawn within track powerupBounds
- [x] **Server Game Loop Manager:**
    - [x] Handle States: `LOBBY` -> `COUNTDOWN` -> `RACING` -> `WINNER` -> `LOBBY`
    - [x] **Dynamic Handling:**
        - [x] Mid-game Joiners -> Spawn as **Drone** (Spectator).
        - [x] Disconnects -> Remove Body & Trigger Win Check immediately.
    - [x] Reset Physics World on Restart
    - [x] Broadcast Timer/State changes

### 🏁 Content Expansion
- [x] **Track Builder Helper:** Pre-built walls for instant switching
- [x] **12 Unique Tracks:**
    - [x] Race Circuits (with waypoint paths)
    - [x] Arenas (chaos bowls with center targeting)
    - [x] Terrain heightfields per track

### ✨ Polish & UX
- [x] **Scenery System:** Instanced Palms/Buildings for performance
- [x] **Game Loop UI:** 
    - [x] "Waiting for Players" / Tutorial Overlay
    - [x] "Winner" Celebration Screen
    - [x] Countdown timer display
- [x] **Leaderboard System:** Top 10 with wins/kills/deaths
- [ ] **Mobile Polish:** Reconnection handling & Haptics
