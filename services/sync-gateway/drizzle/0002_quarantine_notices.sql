CREATE TABLE "kernel"."quarantine_notices" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"device_id" text NOT NULL,
	"claimed_event_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" bigint NOT NULL,
	"delivered_at" bigint,
	CONSTRAINT "quarantine_notices_org_claimed_event_uq" UNIQUE("org_id","claimed_event_id")
);
--> statement-breakpoint
CREATE INDEX "quarantine_notices_org_device_delivered_idx" ON "kernel"."quarantine_notices" USING btree ("org_id","device_id","delivered_at");