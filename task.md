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
- [ ] **Assets:** Scenery Elements (Neon Palms, Mountains, Sun, Buildings)
- [ ] **Audio:** N64-style Background Music (Loopable) & SFX
- [ ] **Theme Integration ("Mask")**
    - [ ] **Controller:** Add Mask Selector to Lobby
    - [ ] **Controller:** Add Haptic Feedback (Vibration)
    - [ ] **Server:** Handle `maskType` in player join/state
    - [ ] **Renderer:** Render specific models per player

### ⚔️ Advanced Mechanics (PvP)
- [ ] **Directional Ramming**
    - [ ] Frontend hits deal 1.5x damage, self takes 0.5x
    - [ ] Apply knockback impulse based on velocity
- [ ] **New Power-ups**
    - [ ] **Shield:** 5s Invulnerability (Blue Bubble)
    - [ ] **Phase Shift/Ghost:** 5s Pass-through (Mask Theme)
    - [ ] **Juggernaut:** 10s Double Mass + Red Glow
- [ ] **Refine Spawning:** Ensure items only spawn on track surface
- [ ] **Server Game Loop Manager:**
    - [ ] Handle States: `LOBBY` -> `COUNTDOWN` -> `RACE` -> `WINNER` -> `LOBBY`
    - [ ] **Dynamic Handling:**
        - [ ] Mid-game Joiners -> Spawn as **Drone** (Spectator).
        - [ ] Disconnects -> Remove Body & Trigger Win Check immediately.
    - [ ] Reset Physics World on Restart
    - [ ] Broadcast Timer/State changes

### 🏁 Content Expansion
- [ ] **Track Builder Helper:** `createTrackFromPath(points)`
- [ ] **12 Unique Tracks:**
    - [ ] Race Circuits (accessbile)
    - [ ] Arenas (Chaos bowls)
    - [ ] Survival (Holes/Hazards)

### ✨ Polish & UX
- [ ] **Scenery System:** Instanced Palms/Buildings for performance
- [ ] **Game Loop UI:** 
    - [ ] "Waiting for Players" / Tutorial Overlay
    - [ ] "Winner" Celebration Screen
- [ ] **Mobile Polish:** Reconnection handling & Haptics
