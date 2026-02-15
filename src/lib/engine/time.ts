const MAX_IDLE_REAL_SECONDS = 300; // 5 minutes real time max advancement on idle

export interface TimeCalcResult {
  currentSimTime: number;
  cappedByIdle: boolean;
}

/**
 * Calculate current sim-time from scaled wall-clock.
 * Default scale: 20 sim-seconds per real-second (~3 real seconds = 1 sim minute)
 *
 * Caps advancement if too much real time has passed (AFK protection).
 */
export function calculateSimTime(
  startRealTime: Date,
  lastTickRealTime: Date,
  previousSimTime: number,
  timeScale: number, // sim-seconds per real-second
  now: Date = new Date()
): TimeCalcResult {
  const realSecondsSinceLastTick = (now.getTime() - lastTickRealTime.getTime()) / 1000;

  // Cap real-time advancement to prevent "patient died while AFK"
  const cappedByIdle = realSecondsSinceLastTick > MAX_IDLE_REAL_SECONDS;
  const effectiveRealSeconds = cappedByIdle
    ? MAX_IDLE_REAL_SECONDS
    : realSecondsSinceLastTick;

  // Convert real seconds to sim minutes
  const simSecondsElapsed = effectiveRealSeconds * timeScale;
  const simMinutesElapsed = simSecondsElapsed / 60;

  const currentSimTime = previousSimTime + Math.floor(simMinutesElapsed);

  return { currentSimTime, cappedByIdle };
}

/**
 * Format sim-time as "Day X — HH:MM"
 * Assumes game starts at 14:00 (2 PM) on Day 1
 */
export function formatSimTime(simMinutes: number): string {
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
