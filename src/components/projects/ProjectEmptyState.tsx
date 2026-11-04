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

type Props = {
  onCreate: () => void;
};

export function ProjectEmptyState({ onCreate }: Props) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderOpen aria-hidden />
        </EmptyMedia>
        <EmptyTitle>ยังไม่มีโปรเจกต์</EmptyTitle>
        <EmptyDescription>สร้างโปรเจกต์แรกเพื่อเริ่มออกแบบ</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" onClick={onCreate}>
          <Plus />
          สร้างโปรเจกต์
        </Button>
      </EmptyContent>
    </Empty>
  );
}
