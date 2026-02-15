import type { Scenario } from "./types";
import etohCase from "./etoh-case.json";
import hsvHlhCase from "./hsv-hlh-case.json";

const scenarios: Record<string, Scenario> = {
  "etoh-lgib-dka": etohCase as unknown as Scenario,
  "hsv-hlh-dead-gut": hsvHlhCase as unknown as Scenario,
};

export function getScenario(id: string): Scenario | null {
  return scenarios[id] ?? null;
}

export function listScenarios(): { id: string; title: string }[] {
  return Object.values(scenarios).map((s) => ({ id: s.id, title: s.title }));
}
