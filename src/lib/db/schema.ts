import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  serial,
  boolean,
} from "drizzle-orm/pg-core";

export const gameSessions = pgTable("game_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  scenarioId: text("scenario_id").notNull(),
  status: text("status").notNull().default("active"), // active | completed | abandoned
  startRealTime: timestamp("start_real_time").notNull().defaultNow(),
  lastTickRealTime: timestamp("last_tick_real_time").notNull().defaultNow(),
  simTime: integer("sim_time").notNull().default(0), // current sim-time in minutes
  timeScale: integer("time_scale").notNull().default(20), // sim-seconds per real-second
  conditionStates: jsonb("condition_states").notNull().default({}),
  vitals: jsonb("vitals").notNull().default({}),
  activeTreatments: jsonb("active_treatments").notNull().default([]),
  firedEvents: jsonb("fired_events").notNull().default([]),
  revealedHistory: jsonb("revealed_history").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const gameActions = pgTable("game_actions", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => gameSessions.id),
  simTime: integer("sim_time").notNull(),
  actionType: text("action_type").notNull(),
  actionData: jsonb("action_data").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pendingResults = pgTable("pending_results", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => gameSessions.id),
  resultType: text("result_type").notNull(), // lab | imaging | consult_response
  resultKey: text("result_key").notNull(),
  resultData: jsonb("result_data").notNull().default({}),
  orderedAtSim: integer("ordered_at_sim").notNull(),
  availableAtSim: integer("available_at_sim").notNull(),
  delivered: boolean("delivered").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const gameLog = pgTable("game_log", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => gameSessions.id),
  simTime: integer("sim_time").notNull(),
  role: text("role").notNull(), // user | narrator | patient | alert | result | nurse
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Type exports for use throughout the app
export type GameSession = typeof gameSessions.$inferSelect;
export type GameAction = typeof gameActions.$inferSelect;
export type PendingResult = typeof pendingResults.$inferSelect;
export type GameLogEntry = typeof gameLog.$inferSelect;
