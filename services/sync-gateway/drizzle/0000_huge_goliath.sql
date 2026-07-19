CREATE SCHEMA "kernel";
--> statement-breakpoint
CREATE TABLE "kernel"."device_watermarks" (
	"org_id" text NOT NULL,
	"device_id" text NOT NULL,
	"acked_watermark" bigint NOT NULL,
	CONSTRAINT "device_watermarks_org_id_device_id_pk" PRIMARY KEY("org_id","device_id")
);
--> statement-breakpoint
CREATE TABLE "kernel"."events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"device_id" text NOT NULL,
	"lamport_seq" bigint NOT NULL,
	"global_seq" bigint NOT NULL,
	"server_received_at" bigint NOT NULL,
	"envelope" jsonb NOT NULL,
	CONSTRAINT "events_org_global_seq_uq" UNIQUE("org_id","global_seq"),
	CONSTRAINT "events_org_device_lamport_uq" UNIQUE("org_id","device_id","lamport_seq")
);
--> statement-breakpoint
CREATE TABLE "kernel"."org_sequences" (
	"org_id" text PRIMARY KEY NOT NULL,
	"next_global_seq" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kernel"."quarantine" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"device_id" text NOT NULL,
	"claimed_event_id" text NOT NULL,
	"reason" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"received_at" bigint NOT NULL,
	CONSTRAINT "quarantine_org_claimed_event_uq" UNIQUE("org_id","claimed_event_id")
);
--> statement-breakpoint
CREATE INDEX "events_org_branch_global_seq_idx" ON "kernel"."events" USING btree ("org_id","branch_id","global_seq");