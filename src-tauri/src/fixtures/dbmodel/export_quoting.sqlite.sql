-- Web Builder test schema (SQLite STRICT)

CREATE TABLE "row" (
  "id" INTEGER PRIMARY KEY,
  "values_id" TEXT CONSTRAINT "row_values_id_check" CHECK (length("values_id") = 36),
  "integer" INTEGER DEFAULT 007,
  CONSTRAINT "row_values_id_fkey" FOREIGN KEY ("values_id") REFERENCES "values" ("id") ON DELETE SET NULL
) STRICT;
CREATE INDEX "row_values_id_idx" ON "row" ("values_id");

CREATE TABLE "values" (
  "id" TEXT NOT NULL CONSTRAINT "values_id_check" CHECK (length("id") = 36),
  "position" INTEGER DEFAULT +5,
  "time" TEXT CONSTRAINT "values_time_check" CHECK ("time" IS NULL OR julianday("time") IS NOT NULL),
  "json" TEXT CONSTRAINT "values_json_check" CHECK (json_valid("json")),
  "between" TEXT CONSTRAINT "values_between_check" CHECK ("between" IN ('a', 'b')),
  CONSTRAINT "values_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "values_position_time_key" UNIQUE ("position", "time")
) STRICT;
