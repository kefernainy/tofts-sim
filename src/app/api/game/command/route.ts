import { NextResponse } from "next/server";
import { getScenario } from "@/lib/scenarios";
import {
  loadSession,
  advanceTime,
  executeAction,
  saveState,
  writeLog,
  checkHistoryReveals,
} from "@/lib/engine/engine";
import { parseCommand } from "@/lib/llm/parse-command";
import { callGameMaster } from "@/lib/llm/game-master";
import { formatVitals } from "@/lib/llm/prompts";
import { applyVitalsNoise } from "@/lib/engine/vitals-noise";

export async function POST(request: Request) {
  try {
    const { sessionId, input } = await request.json();

    if (!sessionId || !input) {
      return NextResponse.json(
        { error: "sessionId and input are required" },
        { status: 400 }
      );
    }

    // 1. Load session
    const session = await loadSession(sessionId);
    if (!session || session.status !== "active") {
      return NextResponse.json(
        { error: "Session not found or not active" },
        { status: 404 }
      );
    }

    const scenario = getScenario(session.scenarioId);
    if (!scenario) {
      return NextResponse.json(
        { error: "Scenario not found" },
        { status: 500 }
      );
    }

    // 2. Advance time and process time-based events
    const now = new Date();
    const ctx = await advanceTime(session, scenario, now);
    const { state } = ctx;

    // 3. Check history reveals from user input
    checkHistoryReveals(scenario, state, input);

    // 4. Parse user input via Haiku (Tier 2)
    const parseResult = await parseCommand(input, scenario);

    // 5. Execute structured actions and collect template messages
    const allMessages: { role: string; message: string }[] = [];

    // Log user input
    allMessages.push({ role: "user", message: input });

    // Add any template messages from time advancement (delivered results, etc.)
    for (const msg of ctx.templateMessages) {
      allMessages.push({ role: "result", message: msg });
    }

    // Execute each parsed action
    for (const action of parseResult.actions) {
      // Skip ask_patient and physical_exam — those need narration
      if (
        action.type === "ask_patient" ||
        action.type === "physical_exam"
      ) {
        continue;
      }

      if (action.type === "end_game") {
        state.status = "completed";
        await saveState(state, now);
        return NextResponse.json({
          narrative: "The simulation has ended. Generating your debrief...",
          vitals: state.vitals,
          simTime: state.simTime,
          alerts: [],
          gameOver: true,
        });
      }

      if (action.type === "review_orders") {
        const treatments = state.activeTreatments
          .map((t) => `• ${t.key} (started at min ${t.startedAtSim})`)
          .join("\n") || "No active treatments.";
        allMessages.push({
          role: "nurse",
          message: `Active treatments:\n${treatments}`,
        });
        continue;
      }

      const actionMessages = await executeAction(action, ctx);
      for (const msg of actionMessages) {
        allMessages.push({ role: "nurse", message: msg });
      }
    }

    // 6. Determine if we need LLM narration
    let narrativeText = "";

    if (parseResult.needsNarration || ctx.newEvents.length > 0) {
      // Determine input type for LLM
      let inputType: "patient_question" | "physical_exam" | "event_narration" | "ambiguous" =
        "ambiguous";

      if (parseResult.inputType === "patient_question") {
        inputType = "patient_question";
      } else if (parseResult.inputType === "physical_exam") {
        inputType = "physical_exam";
      } else if (ctx.newEvents.length > 0 && !input) {
        inputType = "event_narration";
      }

      const gmResponse = await callGameMaster(
        scenario,
        state,
        input,
        inputType,
        ctx.newEvents,
        ctx.deliveredResults
      );

      narrativeText = gmResponse.narrative;

      // Track any history revealed by the LLM
      for (const histId of gmResponse.revealedHistory) {
        if (!state.revealedHistory.includes(histId)) {
          state.revealedHistory.push(histId);
        }
      }

      // Determine the role for the log entry
      const role =
        inputType === "patient_question"
          ? "patient"
          : inputType === "event_narration"
          ? "alert"
          : "narrator";

      allMessages.push({ role, message: narrativeText });
    }

    // 7. Build the final response narrative
    // Combine template messages + LLM narration
    const responseNarrative = allMessages
      .filter((m) => m.role !== "user")
      .map((m) => m.message)
      .join("\n\n");

    // 8. Save state and log
    await saveState(state, now);
    await writeLog(session.id, state.simTime, allMessages);

    // Apply vitals noise to display (not saved to DB)
    const displayVitals = applyVitalsNoise(state.vitals, state.conditionStates);

    return NextResponse.json({
      narrative: responseNarrative,
      vitals: displayVitals,
      simTime: state.simTime,
      alerts: ctx.alerts,
      gameOver: false,
      formattedVitals: formatVitals(displayVitals),
    });
  } catch (error) {
    console.error("Game command error:", error);
    return NextResponse.json(
      { error: "Failed to process command" },
      { status: 500 }
    );
  }
}
