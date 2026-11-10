import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceTiles, OpenAECProvider } from "../../../openaec/react/src/index";
import type { CptSelectionSettings } from "../../../core/projectTypes.ts";
// External SVG <use> cannot resolve symbols from an inlined data URL.
import diagramsUrl from "./cptAlgorithmDiagrams.svg?url&no-inline";

type Algorithm = CptSelectionSettings["algorithm"];

export default function CptAlgorithmChoice({ value, onChange }: {
  value: Algorithm | null;
  onChange: (value: Algorithm) => void;
}) {
  const { t } = useTranslation("rightPanel");
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // The pinned ChoiceTiles has no tab stop for mixed/unmatched values.
    // Also restore its normal tab order when a concrete value replaces mixed.
    const tiles = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [])];
    const entry = tiles.find(tile => tile.getAttribute("aria-checked") === "true") ?? tiles[0];
    for (const tile of tiles) tile.tabIndex = tile === entry ? 0 : -1;
  }, [value]);

  return (
    <div ref={root} onKeyDown={event => {
      // Keep native tile activation/navigation away from viewer shortcuts.
      if ([" ", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        event.stopPropagation();
      }
    }}>
      <OpenAECProvider sprite={import.meta.env.MODE === "platform" ? "" : diagramsUrl}>
        <ChoiceTiles label={t("cptSettings.algorithm")} className="cpt-algorithm-options"
          value={value ?? ""}
          options={[
            { value: "quadrants", icon: "cpt.algorithm-quadrants", title: t("cptSettings.quadrants") },
            { value: "maximum-angle", icon: "cpt.algorithm-maximum-angle", title: t("cptSettings.maximumAngle") },
          ]}
          onChange={next => { if (next === "quadrants" || next === "maximum-angle") onChange(next); }} />
      </OpenAECProvider>
    </div>
  );
}
