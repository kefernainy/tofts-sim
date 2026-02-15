"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const scenarios = [
  {
    id: "etoh-lgib-dka",
    title: "EtOH: LGIB, Ketoacidosis & Wernicke's Risk",
    description:
      "47M brought in by EMS with vomiting and bright red blood per rectum. Cachectic, malnourished, and in mild distress. Multiple intersecting pathologies requiring simultaneous management.",
    difficulty: "Intermediate",
    duration: "30-45 min",
    conditions: [
      "Lower GI Bleed",
      "DKA vs EtOH Ketoacidosis",
      "Wernicke's Encephalopathy Risk",
    ],
  },
  {
    id: "hsv-hlh-dead-gut",
    title: "HSV Acute Liver Failure c/b HLH & Dead Gut",
    description:
      "34F on Skyrizi (IL-23 inhibitor) for RA, presenting with large bowel obstruction that evolves into HSV-related acute liver failure complicated by HLH, then bowel ischemia. 3-phase case with escalating severity.",
    difficulty: "Advanced",
    duration: "45-60 min",
    conditions: [
      "Large Bowel Obstruction",
      "Acute Liver Failure (HSV)",
      "HLH",
      "Bowel Ischemia",
    ],
  },
];

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startGame = async (scenarioId: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start game");
      }

      const data = await res.json();
      sessionStorage.setItem(
        `game-${data.sessionId}`,
        JSON.stringify(data)
      );
      router.push(`/game/${data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-terminal-green mb-2">
            MEDICAL SIMULATOR
          </h1>
          <p className="text-terminal-dim text-sm">
            AI-powered clinical case simulation
          </p>
          <div className="mt-4 text-xs text-terminal-dim">
            You are the attending physician. Manage the patient. Make decisions.
            <br />
            Type freely — ask questions, order labs, start treatments, consult specialists.
          </div>
        </div>

        <div className="space-y-4">
          {scenarios.map((scenario) => (
            <div
              key={scenario.id}
              className="border border-terminal-border rounded-lg p-6 hover:border-terminal-green transition-colors group"
            >
              <div className="flex justify-between items-start mb-3">
                <h2 className="text-lg font-bold text-foreground group-hover:text-terminal-green transition-colors">
                  {scenario.title}
                </h2>
                <div className="flex gap-2 text-xs">
                  <span className="text-terminal-yellow">
                    {scenario.difficulty}
                  </span>
                  <span className="text-terminal-dim">
                    {scenario.duration}
                  </span>
                </div>
              </div>

              <p className="text-sm text-terminal-dim mb-4">
                {scenario.description}
              </p>

              <div className="flex flex-wrap gap-2 mb-4">
                {scenario.conditions.map((cond) => (
                  <span
                    key={cond}
                    className="text-xs px-2 py-1 rounded border border-terminal-border text-terminal-cyan"
                  >
                    {cond}
                  </span>
                ))}
              </div>

              <button
                onClick={() => startGame(scenario.id)}
                disabled={loading}
                className="w-full py-2 rounded bg-terminal-green/10 border border-terminal-green text-terminal-green hover:bg-terminal-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
              >
                {loading ? "Initializing..." : "Start Case"}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-4 text-center text-terminal-red text-sm">
            {error}
          </div>
        )}

        <div className="mt-8 border border-terminal-border rounded-lg p-4 text-xs text-terminal-dim">
          <h3 className="text-terminal-cyan font-bold mb-2">
            How to Play
          </h3>
          <ul className="space-y-1">
            <li>
              &bull; Type naturally — &ldquo;order a CBC&rdquo;, &ldquo;ask about alcohol use&rdquo;, &ldquo;examine the abdomen&rdquo;
            </li>
            <li>
              &bull; Time flows automatically — the patient&apos;s condition evolves in real-time
            </li>
            <li>
              &bull; Untreated conditions will worsen — prioritize and manage accordingly
            </li>
            <li>
              &bull; You&apos;ll receive a scored debrief at the end of the case
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
