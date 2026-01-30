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