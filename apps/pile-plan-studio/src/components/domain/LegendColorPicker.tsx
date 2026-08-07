import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { normalizeLegendHexColor } from "../../viewer/legendColors.ts";

type Props = {
  value: string;
  label: string;
  hexLabel: string;
  onChange: (color: string) => void;
};

export default function LegendColorPicker({ value, label, hexLabel, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHexDraft(value), [value]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setHexDraft(value);
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open, value]);

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
        <span className="legend-color-preview" style={{ backgroundColor: value }} />
        <span aria-hidden="true" className="legend-picker-chevron" />
      </button>
      {open ? (
        <div aria-label={label} className="legend-picker-popover legend-color-picker" role="dialog">
          <label className="legend-native-color">
            <span>{label}</span>
            <input
              aria-label={label}
              type="color"
              value={value}
              onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
            />
          </label>
          <label className="legend-hex-color">
            <span>{hexLabel}</span>
            <input
              aria-invalid={normalizeLegendHexColor(hexDraft) === null}
              value={hexDraft}
              onBlur={() => setHexDraft(value)}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setHexDraft(next);
                const normalized = normalizeLegendHexColor(next);
                if (normalized !== null) onChange(normalized);
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setHexDraft(value);
      setOpen(false);
    }
  }
}
