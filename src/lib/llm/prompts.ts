import type { Scenario, GameState, Vitals } from "@/lib/scenarios/types";
import type { FiredEvent } from "@/lib/engine/events";
import type { DeliveredResult } from "@/lib/scenarios/types";
import { formatSimTime } from "@/lib/engine/time";

/**
 * Build the system prompt for the game master LLM.
 * Static scenario content goes first (for prompt caching).
 * Dynamic state goes after.
 */
export function buildSystemPrompt(
  scenario: Scenario,
  state: GameState
): string {
  const staticPart = buildStaticPrompt(scenario);
  const dynamicPart = buildDynamicPrompt(scenario, state);
  return `${staticPart}\n\n---\n\n${dynamicPart}`;
}

function buildStaticPrompt(scenario: Scenario): string {
  const p = scenario.patient;
  return `You are the GAME MASTER for a medical simulation. You narrate the scenario, voice the patient, describe physical exam findings, and announce events. You are NOT the doctor — the user is the doctor.

SCENARIO: ${scenario.title}

PATIENT PROFILE:
- Name: ${p.name}, ${p.age}${p.sex}, Chief Complaint: "${p.chiefComplaint}"
- Personality: ${p.personality}
- Presenting narrative: ${p.presentingNarrative}

PATIENT HISTORY (reveal ONLY when asked by the user):
${Object.entries(p.history)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

PHYSICAL EXAM FINDINGS (describe naturally when user examines):
${Object.entries(p.physicalExamFindings)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

RULES:
1. Stay in character. You narrate in third person. Patient speaks in first person when addressed.
2. NEVER suggest diagnoses or treatments. The user must figure it out.
3. NEVER reveal information the user hasn't asked for. Don't volunteer history.
4. When the patient speaks, be realistic — he may be vague, uncomfortable, or guarded (especially about alcohol).
5. Physical exam findings should be described naturally, not as a bullet list.
6. For dramatic events (vitals crash, patient deteriorating), be vivid but concise.
7. Keep responses SHORT — 2-4 sentences for most interactions. Only longer for complex exams or dramatic moments.
8. If the user says something medically nonsensical, have the nurse or patient react realistically.`;
}

function buildDynamicPrompt(scenario: Scenario, state: GameState): string {
  const v = state.vitals;
  const treatments = state.activeTreatments
    .map((t) => `${t.key} (started at ${formatSimTime(t.startedAtSim)})`)
    .join(", ") || "None";

  const conditionSummary = Object.entries(state.conditionStates)
    .map(([id, st]) => {
      const cond = scenario.conditions.find((c) => c.id === id);
      return `${cond?.name ?? id}: ${st}`;
    })
    .join(", ");

  return `CURRENT GAME STATE:
- Sim Time: ${formatSimTime(state.simTime)} (${state.simTime} min elapsed)
- Vitals: HR ${v.hr} | BP ${v.bp} | RR ${v.rr} | Temp ${v.temp}°C | SpO2 ${v.spo2}%
- Active Treatments: ${treatments}
- Condition States: ${conditionSummary}
- History Revealed: ${state.revealedHistory.join(", ") || "None yet"}`;
}

/**
 * Build the user message for a game master call, including events context.
 */
export function buildUserMessage(
  userInput: string | null,
  newEvents: FiredEvent[],
  deliveredResults: DeliveredResult[],
  inputType: "patient_question" | "physical_exam" | "event_narration" | "ambiguous"
): string {
  const parts: string[] = [];

  if (newEvents.length > 0) {
    parts.push("EVENTS THAT JUST OCCURRED (narrate these):");
    for (const e of newEvents) {
      parts.push(`- ${e.event.facts}`);
    }
  }

  if (deliveredResults.length > 0) {
    parts.push("RESULTS JUST DELIVERED:");
    for (const r of deliveredResults) {
      const vals = Object.entries(r.data)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      parts.push(`- ${r.type}: ${r.key} — ${vals}`);
    }
  }

  if (userInput) {
    switch (inputType) {
      case "patient_question":
        parts.push(
          `THE DOCTOR ASKS THE PATIENT: "${userInput}"\n\nRespond as the patient, in character. Only reveal what the patient would actually know and share.`
        );
        break;
      case "physical_exam":
        parts.push(
          `THE DOCTOR PERFORMS AN EXAMINATION: "${userInput}"\n\nDescribe the findings naturally and concisely.`
        );
        break;
      case "event_narration":
        parts.push(
          `Narrate the events above dramatically but concisely.`
        );
        break;
      case "ambiguous":
        parts.push(
          `THE DOCTOR SAYS: "${userInput}"\n\nRespond appropriately in the context of this medical scenario.`
        );
        break;
    }
  } else if (newEvents.length > 0) {
    parts.push("Narrate these events concisely and dramatically.");
  }

  return parts.join("\n\n");
}

/**
 * Build the Haiku parse-command system prompt.
 */
export function buildParseSystemPrompt(scenario: Scenario): string {
  const labKeys = Object.keys(scenario.labs);
  const consultKeys = Object.keys(scenario.consults);
  const procedureKeys = Object.keys(scenario.procedures);

  const treatmentKeyList = scenario.treatmentKeys
    ? Object.entries(scenario.treatmentKeys).map(([k, v]) => `${k} (${v})`).join(", ")
    : "NS_bolus (normal saline bolus)";

  return `You are a medical command parser for a simulation game. Parse the doctor's free-text input into structured actions.

AVAILABLE ACTIONS:
- order_lab: Order a lab test. Keys: ${labKeys.join(", ")}
- start_treatment: Start a treatment. Keys: ${treatmentKeyList}
- stop_treatment: Stop a treatment.
- consult: Request a specialist consult. Keys: ${consultKeys.join(", ")}
- check_vitals: Check current vital signs.
- physical_exam: Perform a physical exam on a body system.
- procedure: Perform a procedure. Keys: ${procedureKeys.join(", ")}
- ask_patient: Ask the patient a question.
- wait: Wait/skip time. Include number of minutes.
- review_orders: Review current active orders and treatments.
- end_game: End the simulation.

RULES:
- A single input may map to MULTIPLE actions (e.g., "order CBC, BMP, and start antibiotics" = 3 actions)
- For ambiguous inputs, pick the most likely action
- "Talk to patient" or any direct question → ask_patient
- "Examine the abdomen" → physical_exam with system
- "Give acyclovir" or "start acyclovir" → start_treatment:acyclovir
- "Give anakinra" → start_treatment:anakinra
- "Start antibiotics" or "empiric antibiotics" or "pip-tazo" → start_treatment:empiric_abx
- "Give thiamine" or "start thiamine" → start_treatment:thiamine_high_dose
- "Start a PPI" or "pantoprazole" → start_treatment:PPI
- "Bolus" or "give fluids" or "normal saline bolus" → start_treatment:NS_bolus
- "Start pressors" or "vasopressors" or "norepinephrine" → start_treatment:vasopressors
- "Order labs" without specifics → ask_patient (doctor needs to be specific)
- "Check on the patient" → check_vitals + physical_exam:general`;
}

/**
 * Format vitals for display.
 */
export function formatVitals(v: Vitals): string {
  return `HR ${v.hr} | BP ${v.bp} | RR ${v.rr} | Temp ${v.temp}°C | SpO2 ${v.spo2}%`;
}
