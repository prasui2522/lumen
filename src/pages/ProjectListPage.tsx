import { Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertCircle, LayoutTemplate, Plus, Search } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useT } from "@/lib/messages";
import { AppTooltipProvider } from "@/components/ui/tooltip";
import { ProjectCard, ProjectCardSkeleton } from "@/components/projects/ProjectCard";
import { ProjectEmptyState } from "@/components/projects/ProjectEmptyState";
import { lazyNamed, useMountedOnce, whenIdle } from "@/lib/lazy";
import {
  useProjectsStore,
  type ProjectSummary,
} from "@/stores/projects-store";

/* Dialogs are lazy chunks: mounted on first open, preloaded at idle. */
const NewProjectDialog = lazyNamed(() =>
  import("@/components/projects/NewProjectDialog").then((m) => m.NewProjectDialog),
);
const DeleteProjectDialog = lazyNamed(() =>
  import("@/components/projects/DeleteProjectDialog").then((m) => m.DeleteProjectDialog),
);
const AboutMenu = lazyNamed(() =>
  import("@/components/about-notices").then((m) => m.AboutMenu),
);

export function ProjectListPage() {
  const navigate = useNavigate();
  const projects = useProjectsStore((s) => s.projects);
  const loading = useProjectsStore((s) => s.loading);
  const error = useProjectsStore((s) => s.error);
  const projectsStatus = useProjectsStore((s) => s.projectsStatus);
  const clearError = useProjectsStore((s) => s.clearError);
  const refreshProjects = useProjectsStore((s) => s.refreshProjects);
  const createProject = useProjectsStore((s) => s.createProject);
  const deleteProject = useProjectsStore((s) => s.deleteProject);

  const [newOpen, setNewOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(
    null,
  );
  const [filter, setFilter] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const t = useT();

  const importFrom = async (kind: "folder" | "zip") => {
    setImportError(null);
    const picked = await open({
      directory: kind === "folder",
      multiple: false,
      title: kind === "folder" ? t("openFolder") : t("openZip"),
      filters: kind === "zip" ? [{ name: "Zip", extensions: ["zip"] }] : undefined,
    });
    if (typeof picked !== "string") return;
    const leaf = picked.split(/[/\\]/).filter(Boolean).pop()?.replace(/\.zip$/i, "") || "นำเข้า";
    try {
      const created = await invoke<{ id: string }>(
        kind === "folder" ? "import_project_folder" : "import_project_zip",
        kind === "folder" ? { name: leaf, folder: picked } : { name: leaf, zipPath: picked },
      );
      await refreshProjects();
      navigate(`/editor/${created.id}`);
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };
  const query = filter.trim().toLowerCase();
  const shown = useMemo(
    () => (query ? projects.filter((p) => p.name.toLowerCase().includes(query)) : projects),
    [projects, query],
  );
  const noMatch = query.length > 0 && projects.length > 0 && shown.length === 0;

  // First load only: skeleton cards, revealed after 150 ms so fast loads never flash.
  const firstLoad = loading && projects.length === 0;
  const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    if (!firstLoad) return;
    const t = window.setTimeout(() => setShowSkeleton(true), 150);
    return () => {
      window.clearTimeout(t);
      setShowSkeleton(false);
    };
  }, [firstLoad]);

  const newMounted = useMountedOnce(newOpen);
  const deleteMounted = useMountedOnce(pendingDelete !== null);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(
    () =>
      whenIdle(() => {
        void NewProjectDialog.preload();
        void DeleteProjectDialog.preload();
      }),
    [],
  );

  return (
    <AppTooltipProvider>
    <div className="relative flex min-h-svh min-w-0 flex-col overflow-x-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(120%_80%_at_10%_-10%,oklch(0.88_0.08_195/0.55),transparent_55%),radial-gradient(90%_70%_at_90%_0%,oklch(0.9_0.07_230/0.4),transparent_50%)] dark:bg-[radial-gradient(120%_80%_at_10%_-10%,oklch(0.35_0.08_205/0.45),transparent_55%),radial-gradient(90%_70%_at_90%_0%,oklch(0.32_0.07_230/0.35),transparent_50%)]"
      />
      <header className="sticky top-0 z-10 flex h-14 min-w-0 items-center gap-3 overflow-hidden border-b border-border/80 bg-background/80 px-6 backdrop-blur-md supports-backdrop-filter:bg-background/70">
        <span className="flex shrink-0 items-center gap-2">
          <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-[oklch(0.58_0.12_175)] text-primary-foreground shadow-sm shadow-primary/25">
            <LayoutTemplate className="size-4" />
          </span>
          <span className="text-base font-semibold tracking-tight">Lumen</span>
        </span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="relative w-full max-w-xs min-w-32">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.currentTarget.value)}
              placeholder={t("searchProjectsPlaceholder")}
              aria-label={t("searchProjects")}
              className="h-8 pl-8"
            />
          </div>
          <Suspense fallback={null}>
            <AboutMenu />
          </Suspense>
          <LanguageToggle />
          <ThemeToggle />
          {/* data-focus-fallback: dialogs return focus here if their trigger is gone (e.g. a deleted card). */}
          <Button type="button" variant="outline" className="shrink-0" onClick={() => void importFrom("folder")}>
            {t("openFolderShort")}
          </Button>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => void importFrom("zip")}>
            {t("openZip")}
          </Button>
          <Button type="button" className="shrink-0" data-focus-fallback onClick={() => setNewOpen(true)}>
            <Plus />
            {t("newProject")}
          </Button>
        </div>
      </header>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col overflow-auto scrollbar-thin px-6 py-6">
        {importError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle />
            <AlertDescription>{importError}</AlertDescription>
            <AlertAction>
              <Button type="button" variant="ghost" size="xs" onClick={() => setImportError(null)}>
                {t("close")}
              </Button>
            </AlertAction>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
            <AlertAction>
              <Button type="button" variant="ghost" size="xs" onClick={clearError}>
                {t("close")}
              </Button>
            </AlertAction>
          </Alert>
        ) : null}

        {projects.length === 0 && !loading && !error && projectsStatus === "failed" ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Button type="button" variant="outline" onClick={() => void refreshProjects()}>
              {t("retry")}
            </Button>
          </div>
        ) : projects.length === 0 && !loading && !error && projectsStatus === "ready" ? (
          <ProjectEmptyState onCreate={() => setNewOpen(true)} />
        ) : noMatch ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t("noProjects")}</p>
        ) : (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {showSkeleton && firstLoad
              ? Array.from({ length: 6 }, (_, i) => <ProjectCardSkeleton key={i} />)
              : null}
            {shown.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onRequestDelete={setPendingDelete}
              />
            ))}
          </div>
        )}
      </div>

      <Suspense fallback={null}>
      {newMounted ? (
      <NewProjectDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        busy={loading}
        onSubmit={async (name) => {
          const created = await createProject(name);
          if (created) {
            setNewOpen(false);
            navigate(`/editor/${created.id}`);
          }
          return created !== null; // false: the dialog unlocks for a retry
        }}
      />
      ) : null}

      {deleteMounted ? (
      <DeleteProjectDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        projectName={pendingDelete?.name ?? ""}
        busy={loading}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const ok = await deleteProject(pendingDelete.id);
          if (ok) setPendingDelete(null);
        }}
      />
      ) : null}
      </Suspense>
    </div>
    </AppTooltipProvider>
  );
}
