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
*   **PvP:** Testing simple ramming scenarios to verify knockback and damage scaling.
*   **Theme:** Verify Mask selection propagates from Phone -> Server -> Renderer.
*   **Content:** Verify all 12 tracks are playable without physics holes.
