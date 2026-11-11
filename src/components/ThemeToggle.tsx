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
import { useT, type MessageKey } from "@/lib/messages";
import { setThemePref, useTheme, type ThemePref } from "@/lib/theme";

const ITEMS: { pref: ThemePref; key: MessageKey }[] = [
  { pref: "system", key: "themeSystemShort" },
  { pref: "light", key: "themeLightShort" },
  { pref: "dark", key: "themeDarkShort" },
];

/**
 * Compact theme control. Same `wb.theme` store as the command palette
 * (system | light | dark). Icon button so the 44px editor bar stays one row.
 */
export function ThemeToggle() {
  const { pref } = useTheme();
  const t = useT();
  const current = ITEMS.find((item) => item.pref === pref) ?? ITEMS[0];
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t("theme")}: ${t(current.key)}`}>
              <Icon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t(current.key)}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={pref}
          onValueChange={(v) => {
            if (v === "system" || v === "light" || v === "dark") setThemePref(v);
          }}
        >
          {ITEMS.map((item) => (
            <DropdownMenuRadioItem key={item.pref} value={item.pref}>
              {t(item.key)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
