import Anthropic from "@anthropic-ai/sdk";
import type { Scenario, GameState } from "@/lib/scenarios/types";
import type { GameSession } from "@/lib/db/schema";
import { formatSimTime } from "@/lib/engine/time";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic();
  return _client;
}

type AmbientCategory = "patient" | "nurse" | "room";

/**
 * Pick a weighted random ambient category.
 * patient 40%, nurse 35%, room 25%
 */
export function pickAmbientCategory(): AmbientCategory {
  const r = Math.random();
  if (r < 0.4) return "patient";
  if (r < 0.75) return "nurse";
  return "room";
}

/**
 * Check whether an ambient message should be generated this tick.
 */
export function shouldGenerateAmbient(
  session: GameSession,
  state: GameState,
  now: Date,
  hasEvents: boolean,
  hasResults: boolean
): boolean {
  // Don't fire alongside events or results
  if (hasEvents || hasResults) return false;

  // 5+ sim-minutes since last ambient
  const lastAmbientSimTime = (session as Record<string, unknown>).lastAmbientSimTime as number ?? 0;
  if (state.simTime - lastAmbientSimTime < 5) return false;

  // At least 20 real seconds since last tick (approximation for real-time gap)
  const lastTick = new Date(session.lastTickRealTime).getTime();
  const realGap = (now.getTime() - lastTick) / 1000;
  if (realGap < 20) return false;

  // Probability gate based on condition activity
  const quietStates = ["treated", "resolved", "supplemented", "workup", "resolving", "responding"];
  const isQuiet = Object.values(state.conditionStates).every((s) =>
    quietStates.includes(s)
  );
  const probability = isQuiet ? 0.5 : 0.3;

  return Math.random() < probability;
}

/**
 * Generate a short ambient message via Haiku.
 */
export async function generateAmbientMessage(
  scenario: Scenario,
  state: GameState,
  category: AmbientCategory,
  recentAmbient: string[]
): Promise<{ role: "patient" | "nurse" | "narrator"; message: string } | null> {
  const p = scenario.patient;

  const conditionSummary = Object.entries(state.conditionStates)
    .map(([id, st]) => {
      const cond = scenario.conditions.find((c) => c.id === id);
      return `${cond?.name ?? id}: ${st}`;
    })
    .join(", ");

  const treatments = state.activeTreatments
    .map((t) => t.key)
    .join(", ") || "None";

  const recentList = recentAmbient.length > 0
    ? `\nRECENT AMBIENT MESSAGES (do NOT repeat these):\n${recentAmbient.map((m) => `- "${m}"`).join("\n")}`
    : "";

  const systemPrompt = `You generate brief ambient atmosphere for a medical simulation.
Patient: ${p.name}, ${p.age}${p.sex}, "${p.chiefComplaint}". Personality: ${p.personality}
Conditions: ${conditionSummary}
Vitals: HR ${state.vitals.hr} | BP ${state.vitals.bp} | SpO2 ${state.vitals.spo2}%
Active treatments: ${treatments}
Time: ${formatSimTime(state.simTime)}
${recentList}
RULES: One sentence max. 15 words max. Never suggest diagnosis or treatment. Stay in character. Vary tone.`;

  const userPrompts: Record<AmbientCategory, string> = {
    patient:
      "Generate a brief patient ambient action or utterance — groaning, shifting, mumbling, asking for water, dozing, etc.",
    nurse:
      "Generate a brief nurse ambient action or remark — checking IV, adjusting monitor, charting, commenting.",
    room:
      "Generate a brief ambient room observation — monitor beeps, hallway sounds, PA announcements, curtain movement.",
  };

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: systemPrompt,
      tools: [
        {
          name: "ambient_message",
          description: "Return a short ambient message",
          input_schema: {
            type: "object" as const,
            properties: {
              message: {
                type: "string",
                description: "The ambient message (one sentence, max 15 words)",
              },
            },
            required: ["message"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "ambient_message" },
      messages: [{ role: "user", content: userPrompts[category] }],
    });

    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;

    const input = toolUse.input as { message: string };
    const role: "patient" | "nurse" | "narrator" =
      category === "patient" ? "patient" : category === "nurse" ? "nurse" : "narrator";

    return { role, message: input.message };
  } catch (error) {
    console.error("Ambient generation error:", error);
    return null;
  }
}
