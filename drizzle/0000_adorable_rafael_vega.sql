CREATE TABLE "game_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"sim_time" integer NOT NULL,
	"action_type" text NOT NULL,
	"action_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"sim_time" integer NOT NULL,
	"role" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_real_time" timestamp DEFAULT now() NOT NULL,
	"last_tick_real_time" timestamp DEFAULT now() NOT NULL,
	"sim_time" integer DEFAULT 0 NOT NULL,
	"time_scale" integer DEFAULT 20 NOT NULL,
	"condition_states" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"vitals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active_treatments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fired_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revealed_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_ambient_sim_time" integer DEFAULT 0 NOT NULL,
	"recent_ambient" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"result_type" text NOT NULL,
	"result_key" text NOT NULL,
	"result_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ordered_at_sim" integer NOT NULL,
	"available_at_sim" integer NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_actions" ADD CONSTRAINT "game_actions_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_results" ADD CONSTRAINT "pending_results_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;