"use client";

import { useEffect, useRef } from "react";

export interface LogEntry {
  id: string;
  role: "user" | "narrator" | "patient" | "alert" | "result" | "nurse";
  message: string;
  simTime: number;
}

interface GameLogProps {
  entries: LogEntry[];
}

const roleStyles: Record<string, { color: string; prefix: string }> = {
  user: { color: "text-terminal-green", prefix: "> " },
  narrator: { color: "text-foreground", prefix: "" },
  patient: { color: "text-terminal-yellow", prefix: "" },
  alert: { color: "text-terminal-red", prefix: "" },
  result: { color: "text-terminal-cyan", prefix: "" },
  nurse: { color: "text-terminal-orange", prefix: "[Nurse] " },
};

export default function GameLog({ entries }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {entries.map((entry) => {
        const style = roleStyles[entry.role] ?? roleStyles.narrator;
        const isAlert = entry.role === "alert";
        const isPatient = entry.role === "patient";

        return (
          <div
            key={entry.id}
            className={`fade-in ${
              isAlert ? "border-l-2 border-terminal-red pl-3 alert-pulse" : ""
            }`}
          >
            <div className={`${style.color} whitespace-pre-wrap text-sm leading-relaxed`}>
              {style.prefix}
              {isPatient ? `"${entry.message}"` : entry.message}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
