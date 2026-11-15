import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { usePhrase } from "@/lib/phrases";

type Props = {
  onCreate: () => void;
};

export function ProjectEmptyState({ onCreate }: Props) {
  const p = usePhrase();
  return (
    <Empty className="rounded-2xl border border-dashed border-primary/25 bg-gradient-to-b from-accent/40 to-transparent py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
          <FolderOpen aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{p("ยังไม่มีโปรเจกต์")}</EmptyTitle>
        <EmptyDescription>{p("สร้างโปรเจกต์แรกเพื่อเริ่มออกแบบ")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" size="lg" className="shadow-sm shadow-primary/20" onClick={onCreate}>
          <Plus />
          {p("สร้างโปรเจกต์")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
