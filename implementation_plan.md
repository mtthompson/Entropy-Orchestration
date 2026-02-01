# Implementation Plan - Phase 2: Game Jam Audio-Visuals & Mechanics

## Goal Description
Build upon the solid gameplay foundation by implementing the "Mask" theme, N64-style aesthetics (Sprites/Audio), and advanced PvP mechanics (Ramming, Special Powerups).

## User Review Required
> [!NOTE]
> **Theme Strategy:** "The Car is the Mask".
> *   Players select a car model (Oni, Tech, Skull) in the Lobby.
> *   Visuals: Vaporwave + N64 Billboard Sprites.

## Proposed Changes

### 1. Server (`/server`)
*   **Physics Improvements:**
    *   **Directional Ramming:** In `postStep`, check collision angle. If < 45° (Frontal), scale damage (1.5x / 0.5x) and apply knockback.
    *   **Powerups:** Add `Shield` (Invuln), `PhaseShift` (Collision Filter), `Juggernaut` (Mass * 2).
    *   **Spawning:** Raycast down to ensure spawns are on the floor mesh (not walls/void).
    *   **Content Tools:**
    *   `TrackBuilder.js`: Utility to generate wall bodies from a simple path array.
    *   Define 12 Maps using this tool.
    ## Optimization & Visual Fixes
#### [MODIFY] [AudiencePlacement.js](file:///c:/Users/Matthew/Documents/git_repos/Entropy-Orchestration/renderer/src/AudiencePlacement.js)
- **Rotation**: Flip the calculated angle by 180 degrees (remove `+ Math.PI` or add another `PI`).
- **Density**: Increase spacing between groups or reduce density.

#### [MODIFY] [Audience.jsx](file:///c:/Users/Matthew/Documents/git_repos/Entropy-Orchestration/renderer/src/Audience.jsx)
- **Remove Bleaches**: Delete the `Grandstand` component's box geometries.
- **Performance**: Switch from individual `MiiCharacter` components to a single `InstancedCrowd` system.
    - Flatten the list of positions.
    - Instead of 4-5 "Grandstands" with 30 people each (150 components), we might have 50 groups of 10 people (500 instances) but rendered as ONE mesh.
    - Generate a cloud of points around each "center" returned by `AudiencePlacement.js`.
    *   **Game Manager:**
        *   New Class `GameManager`.
        *   Manage `gameState` (LOBBY, RACING, ENDED).
        *   **Join Policy:**
            *   *Lobby:* Spawn as Driver.
            *   *Race:* Spawn as **Drone**. (Keeps "Last Man Standing" fair).
        *   **Leave Policy:**
            *   Immediate removal of Body.
            *   Recalculate `alivePlayers`. If == 1, Trigger Win.
        *   Auto-restart timer (15s post-game).

### 2. Renderer (`/renderer`)
*   **Audio System:**
    *   Global `AudioManager`.
    *   **BGM:** Loopable N64 MIDI/Synth track.
    *   **SFX:** Engine pitch logic, bitcrushed explosions.
*   **Visuals:**
    *   **Car Models:** Load GLB based on player's `maskType`.
    *   **Sprites:** Implement `Billboard` component for 2D effects (Smoke, Fire, Item Sparkle).
    *   **Scenery:**
        *   **Environment:** Scrolling grid floor (Infinite feel).
        *   **Background:** Giant Neon Sun, Low-poly Mountains.
        *   **Props:** *InstancedMesh* for Neon Palms/Pillars around the track perimeter.
    *   **UI Overlays:**
        *   Html overlay (Drei `Html`) for "Winner" and "Countdown".
    *   **Powerup VFX:** Bubble Shield, Ghost transparency, Red Juggernaut glow.

### 3. Controller (`/controller`)
*   **Lobby UI:**
    *   Add `MaskSelector` component (Carousel).
    *   Pass `maskType` in `socket.emit('join', { ... })`.
*   **Haptics:**
    *   `navigator.vibrate(200)` on Crash.
    *   `navigator.vibrate([50, 50, 50])` on Elimination.

### 4. Assets
*   **Acquire:**
    *   3-4 Low-poly "Mask" Car vehicles.
    *   Sprite sheets (Explosion, Smoke).
    *   Audio pack (Retro/Synthwave).

## Verification Plan
*   **PvP:** ✅ Ramming scenarios verified - 1.2x/0.7x damage modifiers working.
*   **Theme:** ✅ Mask abilities implemented (Oni resistance, Tech boost, Skull speed, Clown bursts).
*   **Content:** ✅ All 12 tracks playable with pre-built physics walls and terrain heightfields.
*   **Game Flow:** ✅ LOBBY → COUNTDOWN → RACING → WINNER cycle working.
*   **Demo Mode:** ✅ Auto-triggers after 60s with 4-6 CPU opponents.
*   **Leaderboard:** ✅ Tracks wins/kills/deaths/gamesPlayed for top 10.

## Implementation Status: COMPLETE ✅
All Phase 2 features have been implemented. Server, Renderer, and Controller are fully functional.
