# CLAUDE.md

This file provides guidance to Claude Code when working on this codebase.

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run lint         # ESLint
npx drizzle-kit generate   # Generate DB migrations
npx drizzle-kit push       # Push schema to database
npx drizzle-kit studio     # Open Drizzle Studio GUI
```

## Architecture

**Next.js App Router** (v16) with a terminal-themed dark UI (JetBrains Mono, green/cyan text on black).

### Route Structure

```
src/app/
  page.tsx                      — Scenario picker (hardcoded card array)
  game/[sessionId]/page.tsx     — Game session UI (GameTerminal component)
  api/game/
    start/route.ts              — POST: create session, opening narration
    command/route.ts            — POST: process user command
    tick/route.ts               — POST: poll for time-based events (every 5s)
    end/route.ts                — POST: end game, score, debrief
```

### Two-Tier LLM System

1. **Haiku** (`claude-haiku-4-5-20251001`) in `src/lib/llm/parse-command.ts` — Parses free-text user input into structured `ParsedAction[]` via forced tool use (`parse_actions` tool). Returns `{ actions, inputType, needsNarration }`.
2. **Sonnet** (`claude-sonnet-4-5-20250929`) in `src/lib/llm/game-master.ts` — Creative narration for patient dialogue, physical exams, event narration, and debrief generation. Uses prompt caching (`cache_control: { type: "ephemeral" }`) on the static system prompt. Three exports: `callGameMaster()`, `generateOpeningNarration()`, `generateDebrief()`.

Prompts are built in `src/lib/llm/prompts.ts`: static prompt (patient profile, rules — cached) + dynamic prompt (current vitals, conditions, treatments — changes each call).

### Database

Drizzle ORM + Neon Postgres serverless (`@neondatabase/serverless` HTTP driver). Schema in `src/lib/db/schema.ts`:
- `game_sessions` — session state (vitals, conditionStates, activeTreatments, firedEvents as JSONB)
- `game_actions` — every action taken (actionType + actionData JSONB)
- `pending_results` — lab/imaging/consult results with delivery timing
- `game_log` — chat log with roles: user, narrator, patient, alert, result, nurse

### Scenario Engine (`src/lib/engine/`)

- `engine.ts` — Main engine: load session, advance time, execute actions, save state
- `time.ts` — Sim-time calculation with `timeScale` (default 20 sim-seconds per real-second, ~3 real sec = 1 sim min). AFK cap at 300 real seconds. Game starts at 14:00 Day 1.
- `conditions.ts` — State machine transitions (time-based and action-based triggers)
- `events.ts` — Event trigger evaluation (time_elapsed, condition_enters_state, condition_in_state, consult_response)
- `scoring.ts` — Score calculation with three criterion types

## Game Loop

1. **Start** — Client POSTs `{ scenarioId }` to `/api/game/start`. Server creates session with initial condition states and vitals, calls `generateOpeningNarration()` (Sonnet), returns narrative + state. Client stores in `sessionStorage`, navigates to `/game/[sessionId]`.
2. **Command** — User types command → client POSTs to `/api/game/command` → `advanceTime()` → `checkHistoryReveals()` → `parseCommand()` (Haiku) → `executeAction()` per action → `callGameMaster()` (Sonnet, if narration needed) → save state → return response.
3. **Tick polling** — Client polls `/api/game/tick` every 5 seconds → `advanceTime()` processes time-based transitions, delivers pending results, evaluates events → narrate if events fired → return updates.
4. **End** — Triggered by user saying "end simulation" or `gameOver` flag → `/api/game/end` → `calculateScore()` → `generateDebrief()` (Sonnet) → return score breakdown + debrief.

## Engine Details

### Conditions (State Machines)

Each condition defines states and transitions. Transition trigger types:
- `time_elapsed` — global sim time exceeds `afterMinutes`
- `time_elapsed_in_state` — time in current state exceeds `afterMinutes`
- `any_action` / `action_taken` — current action matches any in list
- `all_actions` — all listed actions have been taken
- `procedure_completed` — matches `procedure:key` format

### Events

Trigger types: `game_start`, `time_elapsed` (at `atMinute`), `condition_enters_state`, `condition_in_state` (+ `afterMinutes`), `consult_response`. Each event can include `vitalsChange` (merged into state) and `requiredResponse`.

### Scoring

Three criterion types in `src/lib/engine/scoring.ts`:
- **`action_taken`** — was the action performed at any point?
- **`action_taken_within`** — was it performed within `withinMinutes`?
- **`state_avoided`** — is the condition NOT in the specified bad state?

Action strings use format `"actionType:key"` (e.g., `"order_lab:CBC"`, `"start_treatment:PPI"`). History scoring via `scoredHistoryItems` (keyword matching).

## Scenario Schema

Scenarios are JSON files in `src/lib/scenarios/` following the `Scenario` interface in `types.ts`:

```
id, title, treatmentKeys, patient (facts + initialVitals),
labs, labsOverTime, consults, procedures,
conditions[] (state machines with transitions + scoring),
events[] (triggers + vitalsChange),
scoredHistoryItems[] (keyword-matched history scoring)
```

Current scenarios: `etoh-case.json` (EtOH/LGIB/DKA) and `hsv-hlh-case.json` (HSV/HLH/Dead Gut).

### Adding a New Scenario

1. Create a new JSON file in `src/lib/scenarios/`
2. Import and register it in `src/lib/scenarios/index.ts` (add to `scenarios` record)
3. Add a card to the hardcoded `scenarios` array in `src/app/page.tsx`
4. Add treatment display names to `formatTreatmentName()` in `src/lib/engine/engine.ts` (hardcoded mapping, must be updated manually)

## Key Conventions

- **Imaging uses `order_lab` action type** — CT, AXR, etc. are stored in `scenario.labs` and ordered/scored as `order_lab:key`. There is no separate imaging action type.
- **`treatmentKeys`** in scenario JSON maps machine keys to human-readable names. Used in `buildParseSystemPrompt()` (tells Haiku what treatments exist) and `formatTreatmentName()` (display).
- **`formatTreatmentName()`** in `engine.ts` has a hardcoded mapping that must be updated when adding new treatments/scenarios.
- **Action string format** — `"actionType:key"` used throughout conditions, scoring, and action logging.
- **11 action types** — `order_lab`, `start_treatment`, `stop_treatment`, `consult`, `check_vitals`, `physical_exam`, `procedure`, `ask_patient`, `wait`, `review_orders`, `end_game`.
- **`isConditionTreated()` heuristic** — checks if ANY condition is in a treated/resolved/resolving/responding state to decide which `labsOverTime` values to return.
- **Client-side session data** passed via `sessionStorage` (set on start, consumed on game page).
- **Both LLM clients** use lazy singleton pattern and forced tool use.

## Environment

Required in `.env.local`:
```
DATABASE_URL=postgresql://...?sslmode=require   # Neon Postgres connection string
ANTHROPIC_API_KEY=sk-ant-xxx                     # Read automatically by @anthropic-ai/sdk
```

## Preferences

- When committing, always use `git add -A` to stage all files and push to remote after committing.
