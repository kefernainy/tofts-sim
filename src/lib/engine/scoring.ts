import type { Scenario, GameState, ScoringCriterion } from "@/lib/scenarios/types";
import type { GameAction } from "@/lib/db/schema";

export interface ScoreBreakdown {
  conditionId: string;
  conditionName: string;
  maxPoints: number;
  earnedPoints: number;
  criteria: CriterionResult[];
}

export interface CriterionResult {
  label: string;
  maxPoints: number;
  earned: boolean;
  points: number;
}

export interface ScoreResult {
  totalScore: number;
  maxScore: number;
  percentage: number;
  conditions: ScoreBreakdown[];
  historyScore: HistoryScore;
}

export interface HistoryScore {
  maxPoints: number;
  earnedPoints: number;
  items: { label: string; earned: boolean; points: number }[];
}

export function calculateScore(
  scenario: Scenario,
  state: GameState,
  actions: GameAction[]
): ScoreResult {
  const actionStrings = actions.map(
    (a) => `${a.actionType}${(a.actionData as Record<string, string>)?.key ? ":" + (a.actionData as Record<string, string>).key : ""}`
  );

  const conditions: ScoreBreakdown[] = scenario.conditions.map((condition) => {
    const criteria: CriterionResult[] = condition.scoring.criteria.map(
      (criterion: ScoringCriterion) => {
        const earned = evaluateCriterion(criterion, actionStrings, actions, state, condition.id);
        return {
          label: criterion.label,
          maxPoints: criterion.points,
          earned,
          points: earned ? criterion.points : 0,
        };
      }
    );

    const earnedPoints = criteria.reduce((sum, c) => sum + c.points, 0);

    return {
      conditionId: condition.id,
      conditionName: condition.name,
      maxPoints: condition.scoring.maxPoints,
      earnedPoints,
      criteria,
    };
  });

  // History scoring
  const historyItems = scenario.scoredHistoryItems.map((item) => {
    const earned = state.revealedHistory.includes(item.id);
    return { label: item.label, earned, points: earned ? item.points : 0 };
  });

  const historyScore: HistoryScore = {
    maxPoints: scenario.scoredHistoryItems.reduce((sum, i) => sum + i.points, 0),
    earnedPoints: historyItems.reduce((sum, i) => sum + i.points, 0),
    items: historyItems,
  };

  const totalConditionScore = conditions.reduce((sum, c) => sum + c.earnedPoints, 0);
  const maxConditionScore = conditions.reduce((sum, c) => sum + c.maxPoints, 0);

  const totalScore = totalConditionScore + historyScore.earnedPoints;
  const maxScore = maxConditionScore + historyScore.maxPoints;

  return {
    totalScore,
    maxScore,
    percentage: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
    conditions,
    historyScore,
  };
}

function evaluateCriterion(
  criterion: ScoringCriterion,
  actionStrings: string[],
  actions: GameAction[],
  state: GameState,
  conditionId: string
): boolean {
  switch (criterion.type) {
    case "action_taken":
      return criterion.action ? actionStrings.includes(criterion.action) : false;

    case "action_taken_within": {
      if (!criterion.action || !criterion.withinMinutes) return false;
      const matchingAction = actions.find((a) => {
        const key = (a.actionData as Record<string, string>)?.key;
        const str = key ? `${a.actionType}:${key}` : a.actionType;
        return str === criterion.action;
      });
      return matchingAction
        ? matchingAction.simTime <= criterion.withinMinutes
        : false;
    }

    case "state_avoided":
      return criterion.state
        ? state.conditionStates[conditionId] !== criterion.state
        : false;

    default:
      return false;
  }
}
