import { db } from "@/lib/db";
import {
  gameSessions,
  gameActions,
  pendingResults,
  gameLog,
} from "@/lib/db/schema";
import type { GameSession } from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { getScenario } from "@/lib/scenarios";
import type {
  Scenario,
  GameState,
  Vitals,
  ParsedAction,
  Treatment,
  DeliveredResult,
} from "@/lib/scenarios/types";
import { calculateSimTime } from "./time";
import { evaluateTimeBasedTransitions, evaluateActionTransitions } from "./conditions";
import { evaluateEvents, type FiredEvent } from "./events";

export interface EngineContext {
  scenario: Scenario;
  state: GameState;
  newEvents: FiredEvent[];
  deliveredResults: DeliveredResult[];
  templateMessages: string[];
  alerts: string[];
}

/**
 * Load a game session and build current game state.
 */
export async function loadSession(sessionId: string): Promise<GameSession | null> {
  const sessions = await db
    .select()
    .from(gameSessions)
    .where(eq(gameSessions.id, sessionId))
    .limit(1);

  return sessions[0] ?? null;
}

/**
 * Build a GameState from a database session row.
 */
export function sessionToGameState(session: GameSession): GameState {
  return {
    sessionId: session.id,
    scenarioId: session.scenarioId,
    simTime: session.simTime,
    vitals: session.vitals as Vitals,
    conditionStates: session.conditionStates as Record<string, string>,
    activeTreatments: session.activeTreatments as Treatment[],
    firedEvents: session.firedEvents as string[],
    revealedHistory: session.revealedHistory as string[],
    status: session.status,
  };
}

/**
 * Advance time and process all time-based events/transitions/results.
 * This is the "tick" logic — runs on every request (command or poll).
 */
export async function advanceTime(
  session: GameSession,
  scenario: Scenario,
  now: Date = new Date()
): Promise<EngineContext> {
  const state = sessionToGameState(session);
  const { currentSimTime } = calculateSimTime(
    session.startRealTime,
    session.lastTickRealTime,
    session.simTime,
    session.timeScale,
    now
  );

  state.simTime = currentSimTime;

  // Track state entry times for time_elapsed_in_state triggers
  // For simplicity, we approximate based on fired events and condition states
  const stateEntryTimes: Record<string, number> = {};
  for (const condition of scenario.conditions) {
    // Default: entered at game start (0)
    stateEntryTimes[condition.id] = 0;
  }

  // 1. Evaluate time-based condition transitions
  const conditionTransitions = evaluateTimeBasedTransitions(
    scenario.conditions,
    state,
    currentSimTime,
    stateEntryTimes
  );

  for (const t of conditionTransitions) {
    state.conditionStates[t.conditionId] = t.to;
  }

  // 2. Check for pending results that are now available
  const readyResults = await db
    .select()
    .from(pendingResults)
    .where(
      and(
        eq(pendingResults.sessionId, session.id),
        eq(pendingResults.delivered, false),
        lte(pendingResults.availableAtSim, currentSimTime)
      )
    );

  const deliveredResultsList: DeliveredResult[] = [];
  const templateMessages: string[] = [];
  const consultResponses: string[] = [];

  for (const result of readyResults) {
    await db
      .update(pendingResults)
      .set({ delivered: true })
      .where(eq(pendingResults.id, result.id));

    const data = result.resultData as Record<string, string | number>;

    if (result.resultType === "lab") {
      deliveredResultsList.push({
        type: "lab",
        key: result.resultKey,
        data,
      });

      const valuesStr = Object.entries(data)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      templateMessages.push(`📋 Lab Results — ${result.resultKey}: ${valuesStr}`);
    } else if (result.resultType === "consult_response") {
      deliveredResultsList.push({
        type: "consult",
        key: result.resultKey,
        data,
      });
      consultResponses.push(result.resultKey);
    }
  }

  // 3. Evaluate events
  const firedEvents = evaluateEvents(
    scenario.events,
    state,
    currentSimTime,
    consultResponses
  );

  const alerts: string[] = [];

  for (const fired of firedEvents) {
    state.firedEvents.push(fired.event.id);

    // Apply vitals changes
    if (fired.vitalsChange) {
      state.vitals = { ...state.vitals, ...fired.vitalsChange };
    }

    // Track alerts for critical events
    if (fired.event.requiredResponse) {
      alerts.push(
        `⚠️ CRITICAL: ${fired.event.facts}`
      );
    }
  }

  return {
    scenario,
    state,
    newEvents: firedEvents,
    deliveredResults: deliveredResultsList,
    templateMessages,
    alerts,
  };
}

/**
 * Execute a parsed action — create pending results, log treatments, etc.
 */
export async function executeAction(
  action: ParsedAction,
  ctx: EngineContext
): Promise<string[]> {
  const { scenario, state } = ctx;
  const messages: string[] = [];
  const actionString = action.key ? `${action.type}:${action.key}` : action.type;

  // Log the action to DB
  await db.insert(gameActions).values({
    sessionId: state.sessionId,
    simTime: state.simTime,
    actionType: action.type,
    actionData: { key: action.key, ...action.details },
  });

  switch (action.type) {
    case "order_lab": {
      const labKey = action.key;
      if (!labKey || !scenario.labs[labKey]) {
        messages.push(`Unknown lab: ${labKey}. Available labs: ${Object.keys(scenario.labs).join(", ")}`);
        break;
      }

      const lab = scenario.labs[labKey];

      // Check if we should use labsOverTime values
      let values = lab.values;
      const overTimeEntries = scenario.labsOverTime[labKey];
      if (overTimeEntries) {
        // Find the best matching over-time entry
        const isTreated = isConditionTreated(state, labKey);
        const matchingEntry = overTimeEntries
          .filter(
            (e) =>
              state.simTime >= e.afterMinutes && e.ifTreated === isTreated
          )
          .sort((a, b) => b.afterMinutes - a.afterMinutes)[0];
        if (matchingEntry) {
          values = matchingEntry.values;
        }
      }

      await db.insert(pendingResults).values({
        sessionId: state.sessionId,
        resultType: "lab",
        resultKey: labKey,
        resultData: values,
        orderedAtSim: state.simTime,
        availableAtSim: state.simTime + lab.turnaroundMinutes,
      });

      messages.push(
        `🧪 ${labKey} ordered. Results expected in ~${lab.turnaroundMinutes} minutes.`
      );
      break;
    }

    case "start_treatment": {
      const treatmentKey = action.key;
      if (!treatmentKey) {
        messages.push("No treatment specified.");
        break;
      }

      // Add to active treatments
      const treatment: Treatment = {
        key: treatmentKey,
        startedAtSim: state.simTime,
        details: action.details,
      };
      state.activeTreatments.push(treatment);
      messages.push(`💊 Started: ${formatTreatmentName(treatmentKey)}`);
      break;
    }

    case "stop_treatment": {
      const stopKey = action.key;
      state.activeTreatments = state.activeTreatments.filter(
        (t) => t.key !== stopKey
      );
      messages.push(`Stopped: ${formatTreatmentName(stopKey ?? "unknown")}`);
      break;
    }

    case "consult": {
      const consultKey = action.key;
      if (!consultKey || !scenario.consults[consultKey]) {
        messages.push(
          `Unknown consult: ${consultKey}. Available: ${Object.keys(scenario.consults).join(", ")}`
        );
        break;
      }

      const consult = scenario.consults[consultKey];
      await db.insert(pendingResults).values({
        sessionId: state.sessionId,
        resultType: "consult_response",
        resultKey: consultKey,
        resultData: { outcome: consult.outcome },
        orderedAtSim: state.simTime,
        availableAtSim: state.simTime + consult.responseDelayMinutes,
      });

      messages.push(
        `📞 ${consultKey} consult placed. Expected response in ~${consult.responseDelayMinutes} minutes.`
      );
      break;
    }

    case "check_vitals": {
      const v = state.vitals;
      messages.push(
        `Vitals: HR ${v.hr} | BP ${v.bp} | RR ${v.rr} | Temp ${v.temp}°C | SpO2 ${v.spo2}%`
      );
      break;
    }

    case "procedure": {
      const procKey = action.key;
      if (!procKey || !scenario.procedures[procKey]) {
        messages.push(`Unknown procedure: ${procKey}`);
        break;
      }

      const proc = scenario.procedures[procKey];
      // Advance sim time for procedure
      state.simTime += proc.durationMinutes;
      messages.push(
        `🔧 Performing ${procKey}... (${proc.durationMinutes} min)`
      );
      if (proc.outcome) {
        messages.push(`Result: ${proc.outcome}`);
      }
      break;
    }

    case "wait": {
      const waitMinutes = parseInt(action.key ?? "30", 10);
      state.simTime += waitMinutes;
      messages.push(`⏳ ${waitMinutes} minutes pass...`);
      break;
    }

    default:
      break;
  }

  // Check for action-based condition transitions
  const allActions = await db
    .select()
    .from(gameActions)
    .where(eq(gameActions.sessionId, state.sessionId));

  const allActionStrings = allActions.map((a) => {
    const key = (a.actionData as Record<string, string>)?.key;
    return key ? `${a.actionType}:${key}` : a.actionType;
  });

  const transitions = evaluateActionTransitions(
    scenario.conditions,
    state,
    actionString,
    allActionStrings
  );

  for (const t of transitions) {
    state.conditionStates[t.conditionId] = t.to;
  }

  return messages;
}

/**
 * Save updated game state back to the database.
 */
export async function saveState(state: GameState, now: Date = new Date()) {
  await db
    .update(gameSessions)
    .set({
      simTime: state.simTime,
      vitals: state.vitals,
      conditionStates: state.conditionStates,
      activeTreatments: state.activeTreatments,
      firedEvents: state.firedEvents,
      revealedHistory: state.revealedHistory,
      lastTickRealTime: now,
      status: state.status,
    })
    .where(eq(gameSessions.id, state.sessionId));
}

/**
 * Write messages to the game log.
 */
export async function writeLog(
  sessionId: string,
  simTime: number,
  entries: { role: string; message: string }[]
) {
  if (entries.length === 0) return;
  await db.insert(gameLog).values(
    entries.map((e) => ({
      sessionId,
      simTime,
      role: e.role,
      message: e.message,
    }))
  );
}

/**
 * Check history items for keyword matches in user input.
 */
export function checkHistoryReveals(
  scenario: Scenario,
  state: GameState,
  userInput: string
): string[] {
  const newReveals: string[] = [];
  const lowerInput = userInput.toLowerCase();

  for (const item of scenario.scoredHistoryItems) {
    if (state.revealedHistory.includes(item.id)) continue;
    if (item.keywords.some((kw) => lowerInput.includes(kw.toLowerCase()))) {
      newReveals.push(item.id);
      state.revealedHistory.push(item.id);
    }
  }

  return newReveals;
}

// Helpers

function isConditionTreated(state: GameState, _labKey: string): boolean {
  // Generic heuristic: check if ANY condition is in a treated/resolved/resolving state
  for (const condState of Object.values(state.conditionStates)) {
    if (["treated", "resolved", "resolving", "responding"].includes(condState)) {
      return true;
    }
  }
  return false;
}

function formatTreatmentName(key: string): string {
  const names: Record<string, string> = {
    // EtOH case treatments
    PPI: "Proton Pump Inhibitor (IV Pantoprazole 40mg BID)",
    D5NS_20KCL: "D5NS + 20mEq KCL @ 150mL/hr",
    IVF_dextrose: "IV Fluids with Dextrose",
    thiamine_high_dose: "Thiamine 500mg IV q8h (high-dose)",
    folic_acid: "Folic Acid 1mg PO daily",
    multivitamin: "Multivitamin IV daily",
    banana_bag: "Banana Bag (MVI + Thiamine + Folate in NS)",
    // HSV-HLH case treatments
    empiric_abx: "Empiric Antibiotics (Pip-Tazo 4.5g IV q6h)",
    anakinra: "Anakinra 100mg SC daily (IL-1 receptor antagonist)",
    dexamethasone: "Dexamethasone 40mg IV daily",
    acyclovir: "Acyclovir 10mg/kg IV q8h",
    NS_bolus: "Normal Saline 1L bolus",
    vasopressors: "Norepinephrine drip",
  };
  return names[key] ?? key;
}
