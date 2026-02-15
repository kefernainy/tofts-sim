export interface Scenario {
  id: string;
  title: string;
  treatmentKeys?: Record<string, string>;
  patient: PatientFacts;
  labs: Record<string, LabDefinition>;
  labsOverTime: Record<string, LabOverTimeEntry[]>;
  consults: Record<string, ConsultDefinition>;
  procedures: Record<string, ProcedureDefinition>;
  conditions: ConditionDefinition[];
  events: GameEvent[];
  scoredHistoryItems: ScoredHistoryItem[];
}

export interface PatientFacts {
  name: string;
  age: number;
  sex: string;
  personality: string;
  chiefComplaint: string;
  presentingNarrative: string;
  history: Record<string, string>;
  physicalExamFindings: Record<string, string>;
  initialVitals: Vitals;
}

export interface Vitals {
  hr: number;
  bp: string;
  rr: number;
  temp: number;
  spo2: number;
}

export interface LabDefinition {
  values: Record<string, string | number>;
  turnaroundMinutes: number;
}

export interface LabOverTimeEntry {
  afterMinutes: number;
  ifTreated: boolean;
  values: Record<string, string | number>;
}

export interface ConsultDefinition {
  responseDelayMinutes: number;
  outcome: string;
}

export interface ProcedureDefinition {
  durationMinutes: number;
  requirements: string[];
  outcome?: string;
}

export interface ConditionDefinition {
  id: string;
  name: string;
  initialState: string;
  states: string[];
  transitions: ConditionTransition[];
  scoring: ConditionScoring;
}

export interface ConditionTransition {
  from: string | string[];
  to: string;
  trigger: TransitionTrigger;
}

export interface TransitionTrigger {
  type: string;
  actions?: string[];
  action?: string;
  procedure?: string;
  afterMinutes?: number;
  atMinute?: number;
  condition?: string;
  state?: string;
}

export interface ConditionScoring {
  maxPoints: number;
  criteria: ScoringCriterion[];
}

export interface ScoringCriterion {
  type: string;
  action?: string;
  state?: string;
  withinMinutes?: number;
  points: number;
  label: string;
}

export interface GameEvent {
  id: string;
  trigger: EventTrigger;
  facts: string;
  vitalsChange?: Partial<Vitals>;
  requiredResponse?: {
    actions: string[];
    windowMinutes: number;
  };
  ifNotAddressed?: {
    outcome: string;
  };
  condition?: string;
}

export interface EventTrigger {
  type: string;
  atMinute?: number;
  condition?: string;
  state?: string;
  afterMinutes?: number;
  consult?: string;
}

export interface ScoredHistoryItem {
  id: string;
  keywords: string[];
  points: number;
  label: string;
}

// Runtime game state types
export interface GameState {
  sessionId: string;
  scenarioId: string;
  simTime: number;
  vitals: Vitals;
  conditionStates: Record<string, string>;
  activeTreatments: Treatment[];
  firedEvents: string[];
  revealedHistory: string[];
  status: string;
}

export interface Treatment {
  key: string;
  startedAtSim: number;
  details?: Record<string, string>;
}

export interface EngineResult {
  narrative: string;
  vitals: Vitals;
  simTime: number;
  alerts: string[];
  deliveredResults: DeliveredResult[];
  gameOver: boolean;
}

export interface DeliveredResult {
  type: string;
  key: string;
  data: Record<string, string | number>;
}

export interface ParsedAction {
  type: string;
  key?: string;
  details?: Record<string, string>;
}
