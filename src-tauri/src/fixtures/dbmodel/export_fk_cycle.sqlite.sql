-- Web Builder test schema (SQLite STRICT)

CREATE TABLE "departments" (
  "id" TEXT NOT NULL CONSTRAINT "departments_id_check" CHECK (length("id") = 36),
  "head_id" TEXT NOT NULL CONSTRAINT "departments_head_id_check" CHECK (length("head_id") = 36),
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "departments_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "people" ("id") ON DELETE RESTRICT
) STRICT;
CREATE INDEX "departments_head_id_idx" ON "departments" ("head_id");

CREATE TABLE "invites" (
  "id" INTEGER PRIMARY KEY,
  "email" TEXT NOT NULL,
  CONSTRAINT "invites_email_fkey" FOREIGN KEY ("email") REFERENCES "people" ("email") ON DELETE CASCADE,
  CONSTRAINT "invites_email_fkey_7884fd36" FOREIGN KEY ("email") REFERENCES "people" ("email") ON DELETE NO ACTION
) STRICT;
CREATE INDEX "invites_email_idx" ON "invites" ("email");

CREATE TABLE "people" (
  "id" TEXT NOT NULL CONSTRAINT "people_id_check" CHECK (length("id") = 36),
  "email" TEXT NOT NULL,
  "department_id" TEXT CONSTRAINT "people_department_id_check" CHECK (length("department_id") = 36),
  CONSTRAINT "people_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "people_email_key" UNIQUE ("email"),
  CONSTRAINT "people_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE SET NULL
) STRICT;
CREATE INDEX "people_department_id_idx" ON "people" ("department_id");
