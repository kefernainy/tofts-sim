import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gameSessions, gameLog } from "@/lib/db/schema";
import { getScenario } from "@/lib/scenarios";
import { generateOpeningNarration } from "@/lib/llm/game-master";
import type { GameState } from "@/lib/scenarios/types";

export async function POST(request: Request) {
  try {
    const { scenarioId } = await request.json();

    const scenario = getScenario(scenarioId);
    if (!scenario) {
      return NextResponse.json(
        { error: `Unknown scenario: ${scenarioId}` },
        { status: 400 }
      );
    }

    // Initialize condition states from scenario
    const conditionStates: Record<string, string> = {};
    for (const condition of scenario.conditions) {
      conditionStates[condition.id] = condition.initialState;
    }

    const now = new Date();

    // Create session
    const [session] = await db
      .insert(gameSessions)
      .values({
        scenarioId,
        status: "active",
        startRealTime: now,
        lastTickRealTime: now,
        simTime: 0,
        timeScale: 20, // 20 sim-seconds per real-second
        conditionStates,
        vitals: scenario.patient.initialVitals,
        activeTreatments: [],
        firedEvents: ["initial_presentation"],
        revealedHistory: [],
      })
      .returning();

    // Build initial game state for LLM
    const state: GameState = {
      sessionId: session.id,
      scenarioId,
      simTime: 0,
      vitals: scenario.patient.initialVitals,
      conditionStates,
      activeTreatments: [],
      firedEvents: ["initial_presentation"],
      revealedHistory: [],
      status: "active",
    };

    // Generate opening narration
    const narrative = await generateOpeningNarration(scenario, state);

    // Log the opening narration
    await db.insert(gameLog).values({
      sessionId: session.id,
      simTime: 0,
      role: "narrator",
      message: narrative,
    });

    return NextResponse.json({
      sessionId: session.id,
      narrative,
      vitals: scenario.patient.initialVitals,
      simTime: 0,
      startRealTime: now.toISOString(),
      timeScale: 20,
      patient: {
        name: scenario.patient.name,
        age: scenario.patient.age,
        sex: scenario.patient.sex,
        chiefComplaint: scenario.patient.chiefComplaint,
      },
    });
  } catch (error) {
    console.error("Game start error:", error);
    return NextResponse.json(
      { error: "Failed to start game" },
      { status: 500 }
    );
  }
}
