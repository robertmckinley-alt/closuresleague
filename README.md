# Bamboo Closures League

The ESPN of cannabis wholesale closures — a real-time competition platform that turns Bamboo's daily closure feed into three live leaderboards, with achievement unlocks, momentum tracking, and team thermometers, all rendered in the exact design language of [Bamboo SKU Intelligence](https://bamboo-sku-intelligence.vercel.app).

## Quick start

```bash
# Local preview (any static server)
npx serve .

# Deploy to Vercel
vercel deploy
```

That's it. No build step. Files are JSX, transpiled in the browser by `@babel/standalone`. Same architecture as the parent app.

## Data sources

| Source | URL | Used for |
|---|---|---|
| Closures diff | `https://bamboo-sku-intelligence.vercel.app/data/closures.json` | Every closure event (primary) |
| Local mirror | `./data/closures.json` | Fallback if the primary is unreachable |
| Live snapshot | `https://api-intelligence.getbamboo.com/api/reports` | Supplemental "right now" totals |

If both closures sources are unreachable, the app boots with **demo data** so the design renders for evaluation. A `DEMO DATA` chip appears in the period strip.

## Hard floor

No data prior to **2026-05-13** is shown anywhere. Set in `core.jsx` as `MIN_CLOSURE_DATE`.

## Architecture

```
index.html                     shell · CSS tokens · Babel · React UMD · Tailwind CDN
├── core.jsx                   formatters · date math · VMI classifier · audio · useUrlState · polling
├── ui.jsx                     Tag · Th · GoalBar · Sparkline · Avatar · RankDelta · Kpi · Drawer · AppBar · PeriodPicker · StreakChip
├── effects.jsx                ConfettiBurst · AchievementBanner · EffectsHost (consumes emitter)
├── apiAdapter.jsx             loadWithFallback() → normalized closures[]
├── engines.jsx                buildLeagueState() · buildLeaderboard · evaluateBadges · diffEarnedBadges · computeStreak
├── leagues.jsx                RepsLeague · VmiLeague · TeamLeague · computeWeekHistory
├── exec.jsx                   ExecutiveMode · ActivityFeed (right rail)
├── drawers.jsx                PlayerCardDrawer · GlobalSearch
└── main.jsx                   App shell · 15s polling · event detection · routing
```

Every file attaches its exports to `window.Bcl*` so files can interop without a bundler — the exact pattern used in Bamboo SKU Intelligence.

## Divisions

| League | Includes | Weekly goal |
|---|---|---|
| **Reps League** | Sales reps whose name does **not** contain `josh`, `koen`, or `curtis` (case-insensitive) | `$15,000` |
| **VMI League** | Reps whose name contains `josh`, `koen`, or `curtis` (Josh Novak · Koen McKinley · Curtis Green) | `$10,000` |
| **Team League** | Everyone | `$80,000` |

The VMI tokens live in `core.jsx → VMI_REP_TOKENS`. Edit to taste.

## Gamification surface

### Live events (15-second poll)

| Event | Trigger | Animation | Sound |
|---|---|---|---|
| New leader | #1 changes in a league | Gold throne row flash · confetti burst · top banner | "G-B-D" triad |
| Badge unlocked | Player crosses a threshold | Top banner with badge emoji + glow | "D-G" rising |
| Team 50% / 75% | Team weekly crosses threshold | Top banner | Ascending chord |
| Team 100% | Team weekly hits goal | Banner + confetti | Full ascending chord |
| Rank up / down | Any player rank delta | Δ indicator in row | Subtle rising/falling tone |

Sounds are off by default. Toggle from the speaker icon in the AppBar.

### Achievements

Defined in `engines.jsx → BADGES`:

- **First Blood** — first closure
- **Closer** — $5k week
- **Rainmaker** — $10k week
- **Gold Jacket** — hit your weekly goal
- **Assassin** — 5 closures in a single day
- **Machine** — 10-day closure streak
- **Iron Will** — 20-day closure streak
- **Legend** — $100k lifetime
- **Whale Hunter** — largest single closure of the current month
- **Closer King** — #1 finish in weekly leaderboard

Add new badges by appending to the `BADGES` array and adding evaluation logic in `evaluateBadges()`.

### Goals

Hardcoded in `core.jsx` but the system is per-player. To make goals editable per rep, persist a `{repName → goal}` map in localStorage; the engine already supports it via `decoratePlayers(players, goal)`.

## Routing & state

- Tab + period + custom range persist via `useUrlState` → URL hash + `localStorage` (so a URL like `#tab=%22reps%22&period=%22month%22` deep-links).
- Keyboard: `/` opens search · `1`-`4` jumps tabs · `Esc` closes drawers.

## Responsive

The whole app collapses gracefully under 1279px (the right activity rail moves underneath the main content) and trims navigation under 640px (`.hide-sm`). Tables are scroll-locked to viewport-minus-header so they're usable on phones.

## Implementation roadmap

| Phase | Scope | Effort |
|---|---|---|
| **0. MVP** (this drop) | Three leagues · executive mode · activity feed · player drawer · search · achievements · animations · sounds · 15s polling | Done |
| **1. Persisted goals** | Per-rep editable goal map (manager mode) · UI in player drawer | ~ 1 day |
| **2. Snapshots** | Pin a player to "before / after" a date so movers tab shows multi-day deltas | ~ 1 day |
| **3. Manager mode** | Toggle that adds team/rep goal editing, "spotlight a rep" banners, and a notes column | ~ 2 days |
| **4. Push notifications** | Service worker + web push when your rep moves up/down or hits a milestone | ~ 3 days |
| **5. Profile photos** | Pull avatars from a manifest in `/data/avatars.json` | ~ 0.5 day |
| **6. Mobile-first detail** | Dedicated `?tab=mobile` swipe-card mode for game-day feel on phones | ~ 2 days |

## Editable knobs

| Knob | File | Default |
|---|---|---|
| Min date floor | `core.jsx` `MIN_CLOSURE_DATE` | `2026-05-13` |
| Rep weekly goal | `core.jsx` `WEEKLY_REP_GOAL` | `15000` |
| VMI weekly goal | `core.jsx` `WEEKLY_VMI_GOAL` | `10000` |
| Team weekly goal | `core.jsx` `WEEKLY_TEAM_GOAL` | `80000` |
| Poll interval | `core.jsx` `POLL_MS` | `15000` |
| VMI rep tokens | `core.jsx` `VMI_REP_TOKENS` | `['josh','koen','curtis']` |
| Closures source | `apiAdapter.jsx` `CLOSURES_PRIMARY` | Bamboo SKU Intelligence Vercel |
| Badges | `engines.jsx` `BADGES` | 10 starter badges |

## Sound design philosophy

Synthesized WebAudio blips (sine/triangle), short envelopes, layered into 2–3 note motifs. No samples, no casino, no arcade. Closer to Formula 1 dashboard cues than DraftKings ka-ching.

## What the app does **not** do (intentionally)

- No CRM writes — read-only.
- No login. Public closures data; competitive standing is org-internal but not sensitive.
- No charts library — sparklines are hand-rolled SVG. Matches parent app's restraint.
- No `localStorage` schema migration — the URL hash is the source of truth for view state.
- No emoji overload. Every emoji is load-bearing.
