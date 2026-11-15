-- Vite Studio test schema (SQLite STRICT)

CREATE TABLE "employees" (
  "id" INTEGER PRIMARY KEY,
  "name" TEXT NOT NULL,
  "manager_id" INTEGER,
  "mentor_id" INTEGER,
  CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees" ("id") ON DELETE SET NULL,
  CONSTRAINT "employees_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "employees" ("id") ON DELETE NO ACTION
) STRICT;
CREATE INDEX "employees_manager_id_idx" ON "employees" ("manager_id");
CREATE INDEX "employees_mentor_id_idx" ON "employees" ("mentor_id");
