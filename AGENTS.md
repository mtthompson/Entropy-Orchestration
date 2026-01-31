# AGENTS.md - Project Entropy Orchestration (Codename)

## Project Overview
This is a 48-hour Game Jam project.
**Concept:** A "Demolition Derby Racer" (Combat Racing).
**Goal:** Players use phones to drive. The game runs on a shared big screen. Survival is key.
**Domain:** `jam.gimongous.net` (Renderer displays QR code pointing here).

## System Architecture
* **Server:** Unraid Docker (Node.js) - Headless Authority.
* **Renderer:** Laptop (RTX 4070) - High-end Visuals.
* **Controllers:** Mobile Phones - Input & Dashboard.

## 1. The Server (Authority)
* **Tech:** Node.js, Socket.io, `cannon-es`.
* **Physics:**
    * **Bodies:** Use Spheres for cars (prevents flipping). Mass: 50.
    * **Collisions:** ENABLED. Listen for collision events.
    * **Damage Logic:** If `relativeVelocity > 15`, deduct HP from both cars.
    * **Elimination:** If `HP <= 0`, remove the body. Notify Renderer of death.
* **Power-ups:**
    * Spawn static trigger zones on the track every 5-10s.
    * **Types:** `Repair` (Heal 50 HP), `Boost` (Velocity * 2.0).
* **Roles:**
    * `?role=admin` -> Renderer (Full State).
    * `?role=controller` -> Player (Input).

## 2. The Renderer (Visuals)
* **Tech:** React Three Fiber (R3F), Drei, Post-Processing.
* **Aesthetic:** **Vaporwave / Synthwave**.
    * Neon grids, deep purple/blue background, bloom effects, chromatic aberration.
* **QR Code:** Permanent overlay in top-right: `jam.gimongous.net`.
* **Camera Logic:**
    * **"Pack Leader" Cam:** Follow the average Z-position of the top 3 cars.
    * **The "Kill Floor":** If a car falls off the bottom edge of the screen view, it is eliminated.
* **Visual Effects (The Juice):**
    * **Trails:** Render "Tron-style" ribbon trails behind cars.
    * **Damage:** Cars should smoke or flicker red when HP is low.
    * **Explosions:** Particle burst when a player is eliminated.

## 3. The Controller (Mobile Input)
* **Tech:** React (2D DOM).
* **UI:**
    * **Lobby:** Simple "Enter Name" -> "Join".
    * **Dashboard:** Large Health Bar (Green -> Red), Boost Meter.
    * **Feedback:** Vibrate phone (`navigator.vibrate`) on impact or death.
* **Input:** `DeviceOrientation` (Steering) + Touch (Throttle/Boost).

## 4. Spectator Mode (Drone Swarm)
* If a player is eliminated (or the server is full > 12 players), they respawn as a **Drone**.
* **Drone Mechanics:**
    * Cannot collide with cars.
    * Can tap a button to drop a "Trap" (Static Box) onto the track to mess with survivors.

---

## Development Status (Updated: 2026-01-30)

### ✅ Implemented
* **Project Scaffold:** Monorepo with npm workspaces (`server`, `renderer`, `controller`).
* **Server (Port 3000):**
    * Socket.io server with 60Hz tick rate.
    * `cannon-es` physics with sphere bodies (mass 50).
    * Player join/leave handling, input processing.
    * "Test Arena" track with 4 boundary walls.
    * Game state broadcast to all clients.
* **Renderer (Port 5173):**
    * React Three Fiber setup with Vaporwave aesthetic.
    * Neon grid floor, bloom post-processing.
    * QR code overlay for controller access.
    * Real-time player sphere rendering from server state.
* **Controller (Port 5174):**
    * Mobile-optimized React UI with lobby → dashboard flow.
    * DeviceOrientation steering with exponential curve.
    * Touch throttle/brake controls.
    * Health bar display.
* **Networking:**
    * Server uses default `/socket.io` path.
    * Clients use `/socket.io` for localhost, `/api/socket.io` for production (tailscale strips `/api` prefix).
    * Tailscale serve routes `/` → controller:5174, `/api` → server:3000.
    * Vite configs allow `.ts.net` and `jam.gimongous.net` hosts.

### 🚧 In Progress / TODO
* **Tracks:** Basic test arena complete; need more complex tracks.
* **Combat:** Collision damage detection not yet wired up.
* **Power-ups:** Spawning logic not yet implemented.
* **Visual Polish:** Trails, damage effects, explosions.
* **Spectator/Drone Mode:** Not yet implemented.

### Dev Commands
```bash
npm run dev:server      # Server on :3000
npm run dev:renderer    # Renderer on :5173
npm run dev:controller  # Controller on :5174

# Tailscale dev setup (port 443):
tailscale serve --bg http://localhost:5174            # Controller at /
tailscale serve --bg --set-path /api http://localhost:3000  # Server at /api
```