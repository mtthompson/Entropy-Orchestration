# CPU Pathfinding Fix for "Dragon's Tail"

## Goal Description
CPU players are cutting corners and hitting walls on the "Dragon's Tail" track. This is caused by the track using a sparse path definition (`smoothSegments: 1`) combined with a CPU pathfinding lookahead of 2 waypoints, which causes the CPU to steer along a chord that intersects the inner walls of sharp turns.

I will fix this by subdividing the path segments in the track definition. This will increase the density of waypoints, ensuring that the "lookahead" path remains safely within the track boundaries, without changing the visual geometry of the track (since `smoothSegments: 1` essentially draws straight lines between points).

## User Review Required
> [!NOTE]
> The "Dragon's Tail" path definition will be significantly longer (more points), but the visual shape of the track will remain identical.

## Proposed Changes

### Server
#### [MODIFY] [tracks.js](file:///c:/Users/Matthew/Documents/git_repos/Entropy-Orchestration/server/tracks.js)
- Update `DRAGON_PATH` to include midpoint vertices for all segments.
- This creates "stepping stones" for the CPU pathfinding.

## Verification Plan

### Automated Tests
- I will create a script `scripts/check_waypoint_safety.js` that:
    1. Loads the track.
    2. Simulates the CPU lookahead (line from `path[i]` to `path[i + lookahead]`).
    3. Checks for intersection with track boundaries.
    4. Reports any safety violations.
- Run `node scripts/check_waypoint_safety.js` before the fix to confirm the failures.
- Run `node scripts/check_waypoint_safety.js` after the fix to confirm resolution.
