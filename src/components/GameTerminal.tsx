"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import PatientBanner from "./PatientBanner";
import GameLog, { type LogEntry } from "./GameLog";
import CommandInput from "./CommandInput";
import ScoreReport from "./ScoreReport";

interface Vitals {
  hr: number;
  bp: string;
  rr: number;
  temp: number;
  spo2: number;
}

interface Treatment {
  key: string;
  startedAtSim: number;
}

interface ScoreData {
  score: number;
  maxScore: number;
  percentage: number;
  conditions: Array<{
    conditionId: string;
    conditionName: string;
    maxPoints: number;
    earnedPoints: number;
    criteria: Array<{
      label: string;
      maxPoints: number;
      earned: boolean;
      points: number;
    }>;
  }>;
  historyScore: {
    maxPoints: number;
    earnedPoints: number;
    items: Array<{ label: string; earned: boolean; points: number }>;
  };
  debrief: string;
}

interface GameTerminalProps {
  sessionId: string;
  initialNarrative: string;
  initialVitals: Vitals;
  initialSimTime: number;
  startRealTime: string;
  timeScale: number;
  patientName: string;
  patientAge: number;
  patientSex: string;
  chiefComplaint: string;
}

export default function GameTerminal({
  sessionId,
  initialNarrative,
  initialVitals,
  initialSimTime,
  startRealTime,
  timeScale,
  patientName,
  patientAge,
  patientSex,
  chiefComplaint,
}: GameTerminalProps) {
  const [vitals, setVitals] = useState<Vitals>(initialVitals);
  const [simTime, setSimTime] = useState(initialSimTime);
  const [lastSyncTime, setLastSyncTime] = useState(Date.now());
  const [entries, setEntries] = useState<LogEntry[]>([
    {
      id: "opening",
      role: "narrator",
      message: initialNarrative,
      simTime: 0,
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [activeTreatments, setActiveTreatments] = useState<string[]>([]);
  const entryCounter = useRef(1);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addEntry = useCallback(
    (role: LogEntry["role"], message: string, simTimeVal: number) => {
      const id = `entry-${entryCounter.current++}`;
      setEntries((prev) => [...prev, { id, role, message, simTime: simTimeVal }]);
    },
    []
  );

  // Poll for time-based events every 5 seconds
  useEffect(() => {
    if (gameOver) return;

    tickRef.current = setInterval(async () => {
      if (isProcessing) return;

      try {
        const res = await fetch("/api/game/tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        if (!res.ok) return;

        const data = await res.json();

        setVitals(data.vitals);
        setSimTime(data.simTime);
        setLastSyncTime(Date.now());

        if (data.narrative) {
          addEntry("alert", data.narrative, data.simTime);
        }
      } catch {
        // Silent fail for tick
      }
    }, 5000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [sessionId, gameOver, isProcessing, addEntry]);

  const handleCommand = useCallback(
    async (input: string) => {
      if (isProcessing || gameOver) return;

      setIsProcessing(true);
      addEntry("user", input, simTime);

      try {
        const res = await fetch("/api/game/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, input }),
        });

        if (!res.ok) {
          addEntry("alert", "Error processing command. Please try again.", simTime);
          setIsProcessing(false);
          return;
        }

        const data = await res.json();

        setVitals(data.vitals);
        setSimTime(data.simTime);
        setLastSyncTime(Date.now());

        if (data.narrative) {
          // Split narrative into role-based entries based on content markers
          const parts = data.narrative.split("\n\n").filter(Boolean);
          for (const part of parts) {
            let role: LogEntry["role"] = "narrator";
            if (part.startsWith("[Nurse]") || part.startsWith("Nurse]") || part.includes("ordered") || part.includes("Started:") || part.includes("Stopped:")) {
              role = "nurse";
            } else if (part.startsWith('"') || part.includes('says')) {
              role = "patient";
            } else if (part.includes("CRITICAL") || part.includes("WARNING")) {
              role = "alert";
            } else if (part.includes("Lab Results") || part.includes("results")) {
              role = "result";
            }
            addEntry(role, part, data.simTime);
          }
        }

        if (data.alerts) {
          for (const alert of data.alerts) {
            addEntry("alert", alert, data.simTime);
          }
        }

        if (data.gameOver) {
          setGameOver(true);
          // Fetch score
          const endRes = await fetch("/api/game/end", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });

          if (endRes.ok) {
            const endData = await endRes.json();
            setScoreData(endData);
          }
        }

        // Update active treatments from narrative cues
        if (data.narrative) {
          const startedMatch = data.narrative.match(/Started: (.+)/g);
          if (startedMatch) {
            setActiveTreatments((prev) => {
              const newTreatments = [...prev];
              for (const match of startedMatch) {
                const name = match.replace("Started: ", "").trim();
                if (!newTreatments.includes(name)) {
                  newTreatments.push(name);
                }
              }
              return newTreatments;
            });
          }
        }
      } catch {
        addEntry("alert", "Connection error. Please try again.", simTime);
      } finally {
        setIsProcessing(false);
      }
    },
    [sessionId, isProcessing, gameOver, simTime, addEntry]
  );

  const handleEndGame = useCallback(() => {
    handleCommand("end simulation");
  }, [handleCommand]);

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a]">
      {/* Patient Banner */}
      <PatientBanner
        patientName={patientName}
        age={patientAge}
        sex={patientSex}
        chiefComplaint={chiefComplaint}
        vitals={vitals}
        simTime={simTime}
        startRealTime={startRealTime}
        timeScale={timeScale}
        lastSyncTime={lastSyncTime}
        activeTreatments={activeTreatments}
      />

      {/* Game Log */}
      <GameLog entries={entries} />

      {/* End Game button */}
      {!gameOver && (
        <div className="px-4 py-1 flex justify-end">
          <button
            onClick={handleEndGame}
            className="text-xs text-terminal-dim hover:text-terminal-red transition-colors"
          >
            [End Simulation]
          </button>
        </div>
      )}

      {/* Command Input */}
      <CommandInput
        onSubmit={handleCommand}
        disabled={isProcessing || gameOver}
      />

      {/* Score Report Modal */}
      {scoreData && (
        <ScoreReport
          score={scoreData.score}
          maxScore={scoreData.maxScore}
          percentage={scoreData.percentage}
          conditions={scoreData.conditions}
          historyScore={scoreData.historyScore}
          debrief={scoreData.debrief}
          onClose={() => {
            window.location.href = "/";
          }}
        />
      )}
    </div>
  );
}
