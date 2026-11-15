-- Vite Studio test schema (SQLite STRICT)

CREATE TABLE "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncation_xxxxxx" (
  "id" TEXT NOT NULL CONSTRAINT "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_ff6d888e" CHECK (length("id") = 36),
  "cccccccccccccccccccccccccccccc_very_long_column_name_yyyyyyyyyy" TEXT NOT NULL CONSTRAINT "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_6664d533" CHECK ("cccccccccccccccccccccccccccccc_very_long_column_name_yyyyyyyyyy" IN ('x', 'y')),
  "a" TEXT NOT NULL,
  "b" TEXT NOT NULL,
  "a_b" TEXT NOT NULL,
  "ref_id" TEXT CONSTRAINT "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_abb02ebc" CHECK (length("ref_id") = 36),
  CONSTRAINT "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_f3e5b5f7" PRIMARY KEY ("id"),
  CONSTRAINT "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_cc5354f8" UNIQUE ("cccccccccccccccccccccccccccccc_very_long_column_name_yyyyyyyyyy"),
  CONSTRAINT "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_117e1726" UNIQUE ("a", "b"),
  CONSTRAINT "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_3eb9eaaa" UNIQUE ("a_b"),
  CONSTRAINT "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_f696a44d" FOREIGN KEY ("ref_id") REFERENCES "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncation_xxxxxx" ("id") ON DELETE CASCADE
) STRICT;
CREATE INDEX "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncati_203341b3" ON "aaaaaaaaaaaaaaaaaaaa_very_long_table_name_for_truncation_xxxxxx" ("ref_id");
