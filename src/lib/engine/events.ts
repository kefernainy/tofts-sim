import type { GameEvent, GameState, Vitals } from "@/lib/scenarios/types";

export interface FiredEvent {
  event: GameEvent;
  vitalsChange?: Partial<Vitals>;
}

/**
 * Evaluate which events should fire based on current game state.
 * Excludes already-fired events.
 */
export function evaluateEvents(
  events: GameEvent[],
  state: GameState,
  simTime: number,
  pendingConsultResponses: string[] // consult keys that have been delivered
): FiredEvent[] {
  const fired: FiredEvent[] = [];

  for (const event of events) {
    // Skip already fired
    if (state.firedEvents.includes(event.id)) continue;

    const trigger = event.trigger;
    let shouldFire = false;

    switch (trigger.type) {
      case "game_start":
        // Fires on session creation — handled in /api/game/start
        break;

      case "time_elapsed":
        if (trigger.atMinute !== undefined && simTime >= trigger.atMinute) {
          shouldFire = true;
        }
        break;

      case "condition_enters_state":
        if (
          trigger.condition &&
          trigger.state &&
          state.conditionStates[trigger.condition] === trigger.state
        ) {
          shouldFire = true;
        }
        break;

      case "condition_in_state":
        if (
          trigger.condition &&
          trigger.state &&
          state.conditionStates[trigger.condition] === trigger.state &&
          trigger.afterMinutes &&
          simTime >= trigger.afterMinutes
        ) {
          shouldFire = true;
        }
        break;

      case "consult_response":
        if (trigger.consult && pendingConsultResponses.includes(trigger.consult)) {
          shouldFire = true;
        }
        break;
    }

    if (shouldFire) {
      fired.push({
        event,
        vitalsChange: event.vitalsChange,
      });
    }
  }

  return fired;
}
