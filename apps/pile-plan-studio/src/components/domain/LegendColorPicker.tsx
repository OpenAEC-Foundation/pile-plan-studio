import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { LegendColorScheme, PileSymbol } from "../../core/projectTypes.ts";
import { renderPileSymbol } from "../../viewer/pileSymbols.ts";
import { createLegendColorPickerPalette } from "./legendColorPickerPalette.ts";
import { shouldOpenLegendPickerAbove } from "./legendPickerPlacement.ts";

type Props = {
  value: string;
  label: string;
  freeColorLabel: string;
  openColorPickerLabel: string;
  schemeLabel: string;
  colorScheme: LegendColorScheme;
  colorCount: number;
  previewSymbol?: PileSymbol;
  onChange: (color: string) => void;
};

export default function LegendColorPicker({
  value,
  label,
  freeColorLabel,
  openColorPickerLabel,
  schemeLabel,
  colorScheme,
  colorCount,
  previewSymbol,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const palette = createLegendColorPickerPalette(colorScheme, colorCount, value);

  useLayoutEffect(() => {
    if (!open || !rootRef.current || !popoverRef.current) return;
    const triggerRect = rootRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const boundaryRect = rootRef.current.closest(".legend-editor-sections")?.getBoundingClientRect();
    setOpenAbove(shouldOpenLegendPickerAbove(
      triggerRect.top,
      triggerRect.bottom,
      popoverRect.height,
      boundaryRect?.top ?? 0,
      boundaryRect?.bottom ?? window.innerHeight,
    ));
  }, [open, palette.length]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div className="legend-appearance-picker" onKeyDown={handleKeyDown} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="legend-appearance-trigger is-color"
        title={label}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        {previewSymbol ? (
          <span
            className="legend-color-symbol-preview"
            dangerouslySetInnerHTML={{ __html: renderPileSymbol(previewSymbol, value, { outlineColor: value }) }}
          />
        ) : <span className="legend-color-preview" style={{ backgroundColor: value }} />}
        <span aria-hidden="true" className="legend-picker-chevron" />
      </button>
      {open ? (
        <div
          aria-label={label}
          className={`legend-picker-popover legend-color-picker${openAbove ? " opens-upward" : ""}`}
          ref={popoverRef}
          role="dialog"
        >
          <div className="legend-native-color">
            <span>{freeColorLabel}</span>
            <label className="legend-native-color-control">
              <input
                aria-label={openColorPickerLabel}
                title={openColorPickerLabel}
                type="color"
                value={value}
                onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
              />
              <span>{openColorPickerLabel}</span>
            </label>
          </div>
          <div aria-label={schemeLabel} className="legend-color-scheme-grid" role="listbox">
            {palette.map(({ color, selected }) => (
              <button
                aria-label={color}
                aria-selected={selected}
                className="legend-color-scheme-choice"
                key={color}
                role="option"
                style={{ backgroundColor: color }}
                title={color}
                type="button"
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }
}
