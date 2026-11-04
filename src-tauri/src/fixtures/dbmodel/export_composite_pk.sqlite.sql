-- Web Builder test schema (SQLite STRICT)

CREATE TABLE "projects" (
  "tenant_id" TEXT NOT NULL CONSTRAINT "projects_tenant_id_check" CHECK (length("tenant_id") = 36),
  "code" TEXT NOT NULL,
  "title" TEXT,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("tenant_id", "code"),
  CONSTRAINT "projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE NO ACTION
) STRICT;

CREATE TABLE "tasks" (
  "id" INTEGER PRIMARY KEY,
  "tenant_id" TEXT NOT NULL CONSTRAINT "tasks_tenant_id_check" CHECK (length("tenant_id") = 36),
  "project_code" TEXT NOT NULL,
  "seq" INTEGER,
  CONSTRAINT "tasks_tenant_id_project_code_fkey" FOREIGN KEY ("tenant_id", "project_code") REFERENCES "projects" ("tenant_id", "code") ON DELETE CASCADE,
  CONSTRAINT "tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE RESTRICT
) STRICT;
CREATE INDEX "tasks_tenant_id_project_code_idx" ON "tasks" ("tenant_id", "project_code");
CREATE INDEX "tasks_tenant_id_idx" ON "tasks" ("tenant_id");

CREATE TABLE "tenants" (
  "id" TEXT NOT NULL CONSTRAINT "tenants_id_check" CHECK (length("id") = 36),
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
) STRICT;
