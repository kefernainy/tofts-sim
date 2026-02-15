"use client";

import { useEffect, useState } from "react";

interface SimClockProps {
  simTime: number; // sim-time in minutes from server
  startRealTime: string; // ISO string of when session started
  timeScale: number; // sim-seconds per real-second
  lastSyncTime?: number; // timestamp of last server sync
}

export default function SimClock({
  simTime,
  startRealTime,
  timeScale,
  lastSyncTime,
}: SimClockProps) {
  const [displayTime, setDisplayTime] = useState(simTime);

  useEffect(() => {
    setDisplayTime(simTime);
  }, [simTime]);

  // Client-side interpolation between server syncs
  useEffect(() => {
    const interval = setInterval(() => {
      const syncPoint = lastSyncTime ?? Date.now();
      const realSecondsSinceSync = (Date.now() - syncPoint) / 1000;
      const simMinutesElapsed = (realSecondsSinceSync * timeScale) / 60;
      setDisplayTime(simTime + simMinutesElapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [simTime, timeScale, lastSyncTime]);

  const formatted = formatSimTime(Math.floor(displayTime));

  return (
    <div className="text-terminal-cyan font-mono text-sm">
      <span className="text-terminal-dim mr-2">SIM</span>
      {formatted}
    </div>
  );
}

function formatSimTime(simMinutes: number): string {
  const startHour = 14;
  const startMinute = 0;

  const totalMinutes = startHour * 60 + startMinute + simMinutes;
  const day = Math.floor(totalMinutes / (24 * 60)) + 1;
  const hour = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minute = totalMinutes % 60;

  const hh = hour.toString().padStart(2, "0");
  const mm = minute.toString().padStart(2, "0");

  return `Day ${day} — ${hh}:${mm}`;
}
