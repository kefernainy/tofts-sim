import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gameSessions, gameActions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getScenario } from "@/lib/scenarios";
import { sessionToGameState } from "@/lib/engine/engine";
import { calculateScore } from "@/lib/engine/scoring";
import { generateDebrief } from "@/lib/llm/game-master";

export async function POST(request: Request) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Load session
    const sessions = await db
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, sessionId))
      .limit(1);

    const session = sessions[0];
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
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

    // Mark session as completed
    await db
      .update(gameSessions)
      .set({ status: "completed" })
      .where(eq(gameSessions.id, sessionId));

    // Load all actions
    const actions = await db
      .select()
      .from(gameActions)
      .where(eq(gameActions.sessionId, sessionId));

    // Calculate score
    const state = sessionToGameState(session);
    const score = calculateScore(scenario, state, actions);

    // Build breakdown string for debrief prompt
    const breakdownLines: string[] = [];
    for (const cond of score.conditions) {
      breakdownLines.push(`\n${cond.conditionName} (${cond.earnedPoints}/${cond.maxPoints}):`);
      for (const c of cond.criteria) {
        breakdownLines.push(`  ${c.earned ? "✓" : "✗"} ${c.label} (${c.points}/${c.maxPoints} pts)`);
      }
    }
    breakdownLines.push(`\nHistory Taking (${score.historyScore.earnedPoints}/${score.historyScore.maxPoints}):`);
    for (const item of score.historyScore.items) {
      breakdownLines.push(`  ${item.earned ? "✓" : "✗"} ${item.label} (${item.points} pts)`);
    }

    // Generate narrative debrief
    const debrief = await generateDebrief(scenario, state, {
      totalScore: score.totalScore,
      maxScore: score.maxScore,
      percentage: score.percentage,
      breakdown: breakdownLines.join("\n"),
    });

    return NextResponse.json({
      score: score.totalScore,
      maxScore: score.maxScore,
      percentage: score.percentage,
      conditions: score.conditions,
      historyScore: score.historyScore,
      debrief,
    });
  } catch (error) {
    console.error("Game end error:", error);
    return NextResponse.json(
      { error: "Failed to end game" },
      { status: 500 }
    );
  }
}
