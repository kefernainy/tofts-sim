import { NextResponse } from "next/server";
import { getScenario } from "@/lib/scenarios";
import {
  loadSession,
  advanceTime,
  saveState,
  writeLog,
} from "@/lib/engine/engine";
import { callGameMaster } from "@/lib/llm/game-master";
import { formatVitals } from "@/lib/llm/prompts";

export async function POST(request: Request) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

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

    // Advance time and process events
    const now = new Date();
    const ctx = await advanceTime(session, scenario, now);
    const { state } = ctx;

    const logEntries: { role: string; message: string }[] = [];
    let narrativeText = "";

    // Template messages for delivered results
    for (const msg of ctx.templateMessages) {
      logEntries.push({ role: "result", message: msg });
    }

    // If events fired, call LLM for narration
    if (ctx.newEvents.length > 0) {
      const gmResponse = await callGameMaster(
        scenario,
        state,
        null,
        "event_narration",
        ctx.newEvents,
        ctx.deliveredResults
      );
      narrativeText = gmResponse.narrative;
      logEntries.push({ role: "alert", message: narrativeText });
    }

    // Combine all messages
    const allNarrative =
      [...ctx.templateMessages, narrativeText].filter(Boolean).join("\n\n") ||
      null;

    // Save state
    await saveState(state, now);
    if (logEntries.length > 0) {
      await writeLog(session.id, state.simTime, logEntries);
    }

    return NextResponse.json({
      narrative: allNarrative,
      vitals: state.vitals,
      simTime: state.simTime,
      alerts: ctx.alerts,
      formattedVitals: formatVitals(state.vitals),
    });
  } catch (error) {
    console.error("Game tick error:", error);
    return NextResponse.json(
      { error: "Failed to process tick" },
      { status: 500 }
    );
  }
}
