import Anthropic from "@anthropic-ai/sdk";
import type { Scenario, ParsedAction } from "@/lib/scenarios/types";
import { buildParseSystemPrompt } from "./prompts";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic();
  return _client;
}

export interface ParseResult {
  actions: ParsedAction[];
  inputType: "patient_question" | "physical_exam" | "order" | "ambiguous";
  needsNarration: boolean;
}

/**
 * Tier 2: Use Haiku to parse free-text user input into structured actions.
 * Fast and cheap — used on every command.
 */
export async function parseCommand(
  userInput: string,
  scenario: Scenario
): Promise<ParseResult> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: buildParseSystemPrompt(scenario),
    tools: [
      {
        name: "parse_actions",
        description:
          "Parse the doctor's input into structured game actions",
        input_schema: {
          type: "object" as const,
          properties: {
            actions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: [
                      "order_lab",
                      "start_treatment",
                      "stop_treatment",
                      "consult",
                      "check_vitals",
                      "physical_exam",
                      "procedure",
                      "ask_patient",
                      "wait",
                      "review_orders",
                      "end_game",
                    ],
                  },
                  key: {
                    type: "string",
                    description:
                      "The specific key (lab name, treatment name, consult name, body system, etc.)",
                  },
                  details: {
                    type: "object",
                    description: "Additional details like dose, route, etc.",
                  },
                },
                required: ["type"],
              },
            },
            inputType: {
              type: "string",
              enum: ["patient_question", "physical_exam", "order", "ambiguous"],
              description:
                "The primary classification of the input",
            },
            needsNarration: {
              type: "boolean",
              description:
                "Whether this input requires LLM narration (true for patient questions, exams, ambiguous inputs)",
            },
          },
          required: ["actions", "inputType", "needsNarration"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "parse_actions" },
    messages: [
      {
        role: "user",
        content: userInput,
      },
    ],
  });

  // Extract tool use result
  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    // Fallback: treat as ambiguous
    return {
      actions: [{ type: "ask_patient", key: userInput }],
      inputType: "ambiguous",
      needsNarration: true,
    };
  }

  const input = toolUse.input as {
    actions: ParsedAction[];
    inputType: ParseResult["inputType"];
    needsNarration: boolean;
  };

  return {
    actions: input.actions,
    inputType: input.inputType,
    needsNarration: input.needsNarration,
  };
}
