import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { setThemePref, useTheme, type ThemePref } from "@/lib/theme";

const ITEMS: { pref: ThemePref; label: string }[] = [
  { pref: "system", label: "ตามระบบ" },
  { pref: "light", label: "สว่าง" },
  { pref: "dark", label: "มืด" },
];

/**
 * Compact theme control. Same `wb.theme` store as the command palette
 * (system | light | dark). Icon button so the 44px editor bar stays one row.
 */
export function ThemeToggle() {
  const { pref } = useTheme();
  const current = ITEMS.find((t) => t.pref === pref) ?? ITEMS[0];
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`ธีม: ${current.label}`}>
              <Icon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>ธีม: {current.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuLabel>ธีม</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={pref}
          onValueChange={(v) => {
            if (v === "system" || v === "light" || v === "dark") setThemePref(v);
          }}
        >
          {ITEMS.map((t) => (
            <DropdownMenuRadioItem key={t.pref} value={t.pref}>
              {t.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
