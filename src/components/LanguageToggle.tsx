import { Languages } from "lucide-react";
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
import { setLocale, useLocale, type Locale } from "@/lib/locale";
import { useT } from "@/lib/messages";

/**
 * Thai / English chrome. Same `wb.locale` store as the command palette.
 * The trigger shows TH or EN so the current language is visible without opening the menu.
 */
export function LanguageToggle() {
  const locale = useLocale();
  const t = useT();
  const code = locale === "en" ? "EN" : "TH";
  const label = `${t("language")}: ${code}`;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs font-medium tabular-nums"
              aria-label={label}
            >
              <Languages className="size-3.5" />
              {code}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
          <DropdownMenuRadioItem value="th">TH · {t("languageThai")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">EN · {t("languageEnglish")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
