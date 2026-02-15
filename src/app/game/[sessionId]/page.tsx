"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import GameTerminal from "@/components/GameTerminal";

interface GameInitData {
  sessionId: string;
  narrative: string;
  vitals: {
    hr: number;
    bp: string;
    rr: number;
    temp: number;
    spo2: number;
  };
  simTime: number;
  startRealTime: string;
  timeScale: number;
}

export default function GamePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [initData, setInitData] = useState<GameInitData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Try to load init data from sessionStorage
    const stored = sessionStorage.getItem(`game-${sessionId}`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setInitData(data);
        sessionStorage.removeItem(`game-${sessionId}`);
      } catch {
        setError("Failed to load game data");
      }
    } else {
      setError(
        "Game session data not found. Please start a new game from the home page."
      );
    }
  }, [sessionId]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-terminal-red mb-4">{error}</p>
          <a
            href="/"
            className="text-terminal-green hover:underline"
          >
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  if (!initData) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-terminal-dim">
          Loading game session...
          <span className="cursor-blink ml-1">|</span>
        </div>
      </div>
    );
  }

  return (
    <GameTerminal
      sessionId={initData.sessionId}
      initialNarrative={initData.narrative}
      initialVitals={initData.vitals}
      initialSimTime={initData.simTime}
      startRealTime={initData.startRealTime}
      timeScale={initData.timeScale}
      patientName="Robert Malloy"
      patientAge={47}
      patientSex="M"
      chiefComplaint="Vomiting and rectal bleeding"
    />
  );
}
