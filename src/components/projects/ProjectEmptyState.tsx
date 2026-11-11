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
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderOpen aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{p("ยังไม่มีโปรเจกต์")}</EmptyTitle>
        <EmptyDescription>{p("สร้างโปรเจกต์แรกเพื่อเริ่มออกแบบ")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" onClick={onCreate}>
          <Plus />
          {p("สร้างโปรเจกต์")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
