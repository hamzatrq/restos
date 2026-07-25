CREATE TABLE "kernel"."device_registry" (
	"org_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"device_id" text NOT NULL,
	"device_class" text NOT NULL,
	"revoked_at" bigint,
	CONSTRAINT "device_registry_org_id_device_id_pk" PRIMARY KEY("org_id","device_id")
);
