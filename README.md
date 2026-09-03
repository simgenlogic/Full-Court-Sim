# Full Court Sim

An autonomous 2D basketball game simulator. Click **Simulate Game** and two fictional 5-on-5
teams play a complete, seeded, reproducible basketball game — animated on a top-down court, with
a live scoreboard, play-by-play feed, and a full box score.

There are no player controls. This is a prototype of the *simulation engine and its animated
playback*, not a management game — no seasons, drafts, trades, contracts, or multiplayer. That's
deliberate: get the engine right first.

## Running it

```
npm install
npm run dev       # http://localhost:5173
```

Other scripts: `npm run build`, `npm run test`, `npm run typecheck`, `npm run lint`,
`npm run check:boundaries` (enforces the engine/render architectural split below).

## Architecture

- **`src/engine/`** — pure TypeScript simulation. No React, no DOM, no `Math.random()` (a single
  seeded RNG is threaded through every random draw, so a seed reproduces a game byte-for-byte).
  `simulateGame()` runs a full game possession-by-possession — action selection, shot/pass/
  turnover/rebound/foul/free-throw resolution, fatigue and substitutions, quarters and overtime —
  producing a flat, timestamped event log. `deriveBoxScore()` is a pure reduction of that log into
  stats; nothing is tracked as a separate mutable structure, so displayed stats can never drift
  from what actually happened.
- **`src/render/`** — consumes the event log only. `EventPlayer` is a cursor over the events plus
  an interpolation clock (play/pause/reset/1-2-4-8x speed/next-possession/skip-to-end); `CourtRenderer`
  draws the court and players on a `<canvas>`. The renderer never decides basketball outcomes —
  it only sequences and animates what the engine already decided.
- **`src/ui/`** — React components (scoreboard, controls, play-by-play, box score, tactics
  selectors, roster display).
- **`src/data/teams/`** — two hard-coded fictional rosters (Ironhawks, Thunderbolts) with
  contrasting identities so offense/defense tactics show up differently in their stats.

`scripts/check-boundaries.mjs` enforces the split: nothing outside `engine/` may import from it
except the public barrel (`src/engine/index.ts`), and `engine/` code may never import React/DOM
or call `Math.random()`.

## Testing

85 tests across the engine, box score derivation, and the render layer, including a statistical
calibration gate (aggregate FG%/3P%/FT%/PPG/turnovers across ~120 seeded games land in a
believable range) and a tactics-effect test proving offense/defense styles measurably shift
outcomes, not just labels.
