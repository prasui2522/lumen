import { HrefField } from "@/components/editor/style/HrefField";
import { writeProp } from "@/components/editor/style/write";

type Props = {
  nodeId: string;
  /** Effective link ("" when the button is not linked). */
  value: string;
  disabled: boolean;
};

/**
 * Button `ลิงก์ปลายทาง` (PHASE-9-SPEC §3). Lazy chunk (cmdk via HrefField).
 */
export function ButtonLinkField({ nodeId, value, disabled }: Props) {
  return (
    <HrefField
      id="pf-btn-href"
      label="ลิงก์ปลายทาง"
      value={value}
      disabled={disabled}
      onCommit={(href) => writeProp(nodeId, "href", href)}
    />
  );
}
