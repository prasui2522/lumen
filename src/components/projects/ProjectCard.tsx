import { LayoutTemplate, MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/lib/locale";
import { usePhrase } from "@/lib/phrases";
import { formatRelative } from "@/lib/relative-time";
import type { ProjectSummary } from "@/stores/projects-store";

type Props = {
  project: ProjectSummary;
  onRequestDelete: (project: ProjectSummary) => void;
};

/**
 * Project card (UI-REFRESH S6). Structure unchanged for a11y: the full-card
 * primary <button> (open) and the overflow DropdownMenu trigger are SIBLINGS,
 * never nested interactive elements (AT-SPI reads them as two controls).
 */
export function ProjectCard({ project, onRequestDelete }: Props) {
  const navigate = useNavigate();
  const p = usePhrase();
  const locale = useLocale();
  const open = () => navigate(`/editor/${project.id}`);

  return (
    <Card className="interactive-card group relative min-w-0 gap-0 py-0 transition-colors hover:bg-accent/40">
      <button
        type="button"
        className="flex w-full cursor-pointer flex-col rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring"
        onClick={open}
        aria-label={`${p("เปิดโปรเจกต์")} ${project.name}`}
      >
        <span aria-hidden className="grid aspect-video w-full place-items-center bg-muted">
          <LayoutTemplate className="size-8 text-muted-foreground/40" />
        </span>
        <span className="block min-w-0 p-3 pr-10">
          <span className="block truncate text-sm font-medium">{project.name}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {formatRelative(project.updatedAt, locale)}
          </span>
        </span>
      </button>

      <div className="absolute right-2 bottom-2.5 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`${p("เมนูโปรเจกต์")} ${project.name}`}
              aria-haspopup="menu"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => open()}>{p("เปิดโปรเจกต์")}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onRequestDelete(project)}>
              {p("ลบ")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

/** First-load placeholder with the same footprint as a ProjectCard. */
export function ProjectCardSkeleton() {
  return (
    <Card aria-hidden className="min-w-0 gap-0 py-0">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-1.5 p-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </Card>
  );
}
