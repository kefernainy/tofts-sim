import Anthropic from "@anthropic-ai/sdk";
import type { Scenario, GameState, DeliveredResult } from "@/lib/scenarios/types";
import type { FiredEvent } from "@/lib/engine/events";
import { buildSystemPrompt, buildUserMessage } from "./prompts";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic();
  return _client;
}

export interface GameMasterResponse {
  narrative: string;
  revealedHistory: string[];
}

/**
 * Tier 3: Full Sonnet call for creative narration.
 * Used for patient dialogue, physical exams, event narration, ambiguous inputs.
 */
export async function callGameMaster(
  scenario: Scenario,
  state: GameState,
  userInput: string | null,
  inputType: "patient_question" | "physical_exam" | "event_narration" | "ambiguous",
  newEvents: FiredEvent[],
  deliveredResults: DeliveredResult[]
): Promise<GameMasterResponse> {
  const systemPrompt = buildSystemPrompt(scenario, state);
  const userMessage = buildUserMessage(
    userInput,
    newEvents,
    deliveredResults,
    inputType
  );

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: "game_response",
        description:
          "Return the narrative response and any history items revealed",
        input_schema: {
          type: "object" as const,
          properties: {
            narrative: {
              type: "string",
              description: "The narrative text to display to the user",
            },
            revealedHistory: {
              type: "array",
              items: { type: "string" },
              description:
                "IDs of scored history items that were revealed in this exchange (e.g., 'asked_about_alcohol')",
            },
          },
          required: ["narrative"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "game_response" },
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  // Extract tool use result
  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    // Fallback: extract text content
    const textBlock = response.content.find((c) => c.type === "text");
    return {
      narrative:
        textBlock && textBlock.type === "text"
          ? textBlock.text
          : "The patient stares at you blankly.",
      revealedHistory: [],
    };
  }

  const input = toolUse.input as {
    narrative: string;
    revealedHistory?: string[];
  };

  return {
    narrative: input.narrative,
    revealedHistory: input.revealedHistory ?? [],
  };
}

/**
 * Generate opening narration for game start.
 */
export async function generateOpeningNarration(
  scenario: Scenario,
  state: GameState
): Promise<string> {
  const result = await callGameMaster(
    scenario,
    state,
    null,
    "event_narration",
    [
      {
        event: scenario.events.find((e) => e.id === "initial_presentation")!,
      },
    ],
    []
  );
  return result.narrative;
}

/**
 * Generate end-of-game debrief narration.
 */
export async function generateDebrief(
  scenario: Scenario,
  state: GameState,
  scoreData: {
    totalScore: number;
    maxScore: number;
    percentage: number;
    breakdown: string;
  }
): Promise<string> {
  const systemPrompt = `You are generating an end-of-game debrief for a medical simulation.
The user played as an emergency department doctor managing a patient case.
Write a concise narrative summary (3-5 paragraphs) that:
1. Summarizes what happened during the case
2. Highlights what the doctor did well
3. Notes critical actions that were missed
4. Provides educational takeaways
Be direct and educational. Use a professional but encouraging tone.

SCENARIO: ${scenario.title}
PATIENT: ${scenario.patient.name}, ${scenario.patient.age}${scenario.patient.sex}`;

  const userMessage = `FINAL GAME STATE:
- Sim Time Elapsed: ${state.simTime} minutes
- Condition States: ${JSON.stringify(state.conditionStates)}
- Active Treatments: ${state.activeTreatments.map((t) => t.key).join(", ") || "None"}
- History Items Explored: ${state.revealedHistory.join(", ") || "None"}

SCORE: ${scoreData.totalScore}/${scoreData.maxScore} (${scoreData.percentage}%)

DETAILED BREAKDOWN:
${scoreData.breakdown}

Generate the narrative debrief.`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  return textBlock && textBlock.type === "text"
    ? textBlock.text
    : "Debrief generation failed.";
}
