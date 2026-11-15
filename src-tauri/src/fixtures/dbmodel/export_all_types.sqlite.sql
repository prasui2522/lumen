-- Lumen test schema (SQLite STRICT)

CREATE TABLE "items" (
  "id" TEXT NOT NULL CONSTRAINT "items_id_check" CHECK (length("id") = 36),
  "title" TEXT NOT NULL DEFAULT 'it''s \ ok',
  "qty" INTEGER DEFAULT -9223372036854775808,
  "price" TEXT DEFAULT '-10.50' CONSTRAINT "items_price_check" CHECK (("price" GLOB '[0-9]*' OR "price" GLOB '-[0-9]*') AND "price" NOT GLOB '*[^0-9.-]*'),
  "rate" TEXT CONSTRAINT "items_rate_check" CHECK (("rate" GLOB '[0-9]*' OR "rate" GLOB '-[0-9]*') AND "rate" NOT GLOB '*[^0-9.-]*'),
  "active" INTEGER NOT NULL DEFAULT 1 CONSTRAINT "items_active_check" CHECK ("active" IN (0, 1)),
  "flag" INTEGER DEFAULT 0 CONSTRAINT "items_flag_check" CHECK ("flag" IN (0, 1)),
  "born" TEXT DEFAULT '2026-01-02' CONSTRAINT "items_born_check" CHECK (date("born") = "born"),
  "seen" TEXT DEFAULT (date('now')) CONSTRAINT "items_seen_check" CHECK (date("seen") = "seen"),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) CONSTRAINT "items_created_at_check" CHECK ("created_at" IS NULL OR julianday("created_at") IS NOT NULL),
  "token" TEXT CONSTRAINT "items_token_check" CHECK (length("token") = 36),
  "meta" TEXT CONSTRAINT "items_meta_check" CHECK (json_valid("meta")),
  "status" TEXT NOT NULL DEFAULT 'draft' CONSTRAINT "items_status_check" CHECK ("status" IN ('draft', 'live', 'it''s')),
  "note" TEXT,
  CONSTRAINT "items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "items_title_key" UNIQUE ("title"),
  CONSTRAINT "items_status_born_key" UNIQUE ("status", "born")
) STRICT;
