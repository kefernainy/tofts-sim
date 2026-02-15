import type { Vitals } from "@/lib/scenarios/types";

/**
 * Apply small random noise to vitals for display purposes.
 * Returns a new Vitals object — does NOT mutate the input.
 * Not saved to DB; applied at response time only.
 */
export function applyVitalsNoise(
  vitals: Vitals,
  conditionStates: Record<string, string>
): Vitals {
  // Instability multiplier: unstable conditions = bigger fluctuations
  const unstableStates = ["worsening", "critical", "presenting"];
  const isUnstable = Object.values(conditionStates).some((s) =>
    unstableStates.includes(s)
  );
  const m = isUnstable ? 1.5 : 1.0;

  // Parse BP string "120/80" -> [120, 80]
  const [sysBp, diaBp] = vitals.bp.split("/").map(Number);

  const noisedHr = clamp(vitals.hr + randInt(-3 * m, 3 * m), 30, 200);
  const noisedRr = clamp(vitals.rr + randInt(-1 * m, 1 * m), 4, 40);
  const noisedSpo2 = clamp(vitals.spo2 + randInt(-1 * m, 1 * m), 70, 100);
  const noisedTemp = clamp(
    Math.round((vitals.temp + randFloat(-0.1 * m, 0.1 * m)) * 10) / 10,
    34,
    42
  );

  let noisedSys = clamp(sysBp + randInt(-4 * m, 4 * m), 60, 250);
  let noisedDia = clamp(diaBp + randInt(-3 * m, 3 * m), 30, 150);
  // Ensure diastolic stays below systolic
  if (noisedDia >= noisedSys) {
    noisedDia = noisedSys - 5;
  }

  return {
    hr: Math.round(noisedHr),
    rr: Math.round(noisedRr),
    spo2: Math.round(noisedSpo2),
    temp: noisedTemp,
    bp: `${Math.round(noisedSys)}/${Math.round(noisedDia)}`,
  };
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + Math.ceil(min);
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
