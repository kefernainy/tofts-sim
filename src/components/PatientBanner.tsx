"use client";

import SimClock from "./SimClock";

interface Vitals {
  hr: number;
  bp: string;
  rr: number;
  temp: number;
  spo2: number;
}

interface PatientBannerProps {
  patientName: string;
  age: number;
  sex: string;
  chiefComplaint: string;
  vitals: Vitals;
  simTime: number;
  startRealTime: string;
  timeScale: number;
  lastSyncTime: number;
  activeTreatments: string[];
}

function isAbnormal(key: string, value: number | string): boolean {
  if (key === "hr" && typeof value === "number") return value > 100 || value < 60;
  if (key === "rr" && typeof value === "number") return value > 20 || value < 12;
  if (key === "temp" && typeof value === "number") return value > 38.0 || value < 36.0;
  if (key === "spo2" && typeof value === "number") return value < 94;
  if (key === "bp" && typeof value === "string") {
    const sys = parseInt(value.split("/")[0]);
    return sys < 90 || sys > 180;
  }
  return false;
}

export default function PatientBanner({
  patientName,
  age,
  sex,
  chiefComplaint,
  vitals,
  simTime,
  startRealTime,
  timeScale,
  lastSyncTime,
  activeTreatments,
}: PatientBannerProps) {
  const vitalEntries: { label: string; key: string; value: string }[] = [
    { label: "HR", key: "hr", value: `${vitals.hr}` },
    { label: "BP", key: "bp", value: vitals.bp },
    { label: "RR", key: "rr", value: `${vitals.rr}` },
    { label: "Temp", key: "temp", value: `${vitals.temp}°C` },
    { label: "SpO2", key: "spo2", value: `${vitals.spo2}%` },
  ];

  return (
    <div className="border-b border-terminal-border bg-terminal-surface px-4 py-3">
      {/* Top row: patient info + clock */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <span className="text-terminal-green font-bold">
            {patientName}
          </span>
          <span className="text-terminal-dim text-sm">
            {age}{sex} — &ldquo;{chiefComplaint}&rdquo;
          </span>
        </div>
        <SimClock
          simTime={simTime}
          startRealTime={startRealTime}
          timeScale={timeScale}
          lastSyncTime={lastSyncTime}
        />
      </div>

      {/* Vitals row */}
      <div className="flex items-center gap-6 text-sm">
        {vitalEntries.map((v) => {
          const rawValue = v.key === "bp" ? vitals.bp : (vitals as unknown as Record<string, number | string>)[v.key];
          const abnormal = isAbnormal(v.key, rawValue);
          return (
            <div key={v.key} className="flex items-center gap-1">
              <span className="text-terminal-dim">{v.label}</span>
              <span
                className={
                  abnormal
                    ? "text-terminal-red font-bold"
                    : "text-foreground"
                }
              >
                {v.value}
              </span>
            </div>
          );
        })}

        {activeTreatments.length > 0 && (
          <div className="ml-auto flex items-center gap-1 text-xs">
            <span className="text-terminal-dim">Rx:</span>
            <span className="text-terminal-cyan">
              {activeTreatments.join(", ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
