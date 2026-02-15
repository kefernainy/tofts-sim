import type { ConditionDefinition, GameState } from "@/lib/scenarios/types";

export interface ConditionTransitionResult {
  conditionId: string;
  from: string;
  to: string;
  conditionName: string;
}

/**
 * Evaluate condition state machines for time-based transitions.
 * Action-based transitions are handled separately when actions are executed.
 */
export function evaluateTimeBasedTransitions(
  conditions: ConditionDefinition[],
  state: GameState,
  simTime: number,
  stateEntryTimes: Record<string, number>
): ConditionTransitionResult[] {
  const results: ConditionTransitionResult[] = [];

  for (const condition of conditions) {
    const currentState = state.conditionStates[condition.id];
    if (!currentState) continue;

    for (const transition of condition.transitions) {
      const fromStates = Array.isArray(transition.from)
        ? transition.from
        : [transition.from];

      if (!fromStates.includes(currentState)) continue;

      const trigger = transition.trigger;

      if (trigger.type === "time_elapsed" && trigger.afterMinutes) {
        if (simTime >= trigger.afterMinutes) {
          // Check we haven't already been treated/transitioned past this
          results.push({
            conditionId: condition.id,
            from: currentState,
            to: transition.to,
            conditionName: condition.name,
          });
          break; // Only one transition per condition per tick
        }
      }

      if (trigger.type === "time_elapsed_in_state" && trigger.afterMinutes) {
        const entryTime = stateEntryTimes[condition.id] ?? 0;
        if (simTime - entryTime >= trigger.afterMinutes) {
          results.push({
            conditionId: condition.id,
            from: currentState,
            to: transition.to,
            conditionName: condition.name,
          });
          break;
        }
      }
    }
  }

  return results;
}

/**
 * Evaluate action-based transitions for a specific action just taken.
 */
export function evaluateActionTransitions(
  conditions: ConditionDefinition[],
  state: GameState,
  actionString: string, // e.g. "order_lab:CBC", "start_treatment:PPI"
  allActions: string[] // all actions taken this session
): ConditionTransitionResult[] {
  const results: ConditionTransitionResult[] = [];

  for (const condition of conditions) {
    const currentState = state.conditionStates[condition.id];
    if (!currentState) continue;

    for (const transition of condition.transitions) {
      const fromStates = Array.isArray(transition.from)
        ? transition.from
        : [transition.from];

      if (!fromStates.includes(currentState)) continue;

      const trigger = transition.trigger;

      if (trigger.type === "any_action" && trigger.actions) {
        if (trigger.actions.includes(actionString)) {
          results.push({
            conditionId: condition.id,
            from: currentState,
            to: transition.to,
            conditionName: condition.name,
          });
          break;
        }
      }

      if (trigger.type === "action_taken" && trigger.actions) {
        if (trigger.actions.includes(actionString)) {
          results.push({
            conditionId: condition.id,
            from: currentState,
            to: transition.to,
            conditionName: condition.name,
          });
          break;
        }
      }

      if (trigger.type === "all_actions" && trigger.actions) {
        if (trigger.actions.every((a) => allActions.includes(a) || a === actionString)) {
          results.push({
            conditionId: condition.id,
            from: currentState,
            to: transition.to,
            conditionName: condition.name,
          });
          break;
        }
      }

      if (trigger.type === "procedure_completed" && trigger.procedure) {
        // actionString would be "procedure:sigmoidoscopy"
        if (actionString === `procedure:${trigger.procedure}`) {
          results.push({
            conditionId: condition.id,
            from: currentState,
            to: transition.to,
            conditionName: condition.name,
          });
          break;
        }
      }
    }
  }

  return results;
}
