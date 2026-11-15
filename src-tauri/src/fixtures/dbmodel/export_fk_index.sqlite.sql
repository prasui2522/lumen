-- Vite Studio test schema (SQLite STRICT)

CREATE TABLE "memberships" (
  "user_id" TEXT NOT NULL CONSTRAINT "memberships_user_id_check" CHECK (length("user_id") = 36),
  "team_id" TEXT NOT NULL CONSTRAINT "memberships_team_id_check" CHECK (length("team_id") = 36),
  "role" TEXT NOT NULL,
  "invited_by" TEXT CONSTRAINT "memberships_invited_by_check" CHECK (length("invited_by") = 36),
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("user_id", "team_id"),
  CONSTRAINT "memberships_role_invited_by_key" UNIQUE ("role", "invited_by"),
  CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE CASCADE,
  CONSTRAINT "memberships_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "memberships_role_fkey" FOREIGN KEY ("role") REFERENCES "teams" ("role") ON DELETE RESTRICT
) STRICT;
CREATE INDEX "memberships_team_id_idx" ON "memberships" ("team_id");
CREATE INDEX "memberships_invited_by_idx" ON "memberships" ("invited_by");

CREATE TABLE "teams" (
  "id" TEXT NOT NULL CONSTRAINT "teams_id_check" CHECK (length("id") = 36),
  "role" TEXT NOT NULL,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "teams_role_key" UNIQUE ("role")
) STRICT;

CREATE TABLE "users" (
  "id" TEXT NOT NULL CONSTRAINT "users_id_check" CHECK (length("id") = 36),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
) STRICT;
